import "server-only";
import { z } from "zod";
import { albumDays, localDay, type AlbumDay, type Play } from "@/lib/diary-shared";
import { DIARY_FULL, finishImport, saveAlbumDays, type SaveDaysResult } from "@/lib/diary/entries";
import { lastfmKeys, needsReconnect, recentTracks, type RecentPage } from "@/lib/diary/lastfm";
import { readTimeZone } from "@/lib/push/store";
import { canonicalZone } from "@/lib/push/zones";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Last.fm on the clock. An import reads somebody's history newest first, up
 * to the moment they connected, a page at a time, holding the oldest day of
 * each page back until the next page has finished it. Once it reaches the
 * start, the account is synced every hour by reading back 26 hours, so the
 * whole of today is always counted; merging keeps the larger counts, so
 * reading a day again never lowers it. A full diary ends an import where it
 * is and lets syncs move on, so neither asks Last.fm for plays it can't keep.
 *
 * Days are read on the clock kept with the account (the zone it connected
 * in), so a sync re-reading yesterday from somewhere else files nothing on a
 * different day. An account without one takes the person's own zone, or
 * UTC, and keeps it from then on.
 */

export type LastfmRow = {
  user_id: string;
  lastfm_user: string;
  state: "importing" | "syncing";
  import_to: string | null;
  import_page: number | null;
  import_added: number;
  carry: Play[] | null;
  synced_to: string | null;
  time_zone: string | null;
};

export type LastfmPatch = Partial<{
  state: "importing" | "syncing" | "needs_reconnect";
  import_page: number | null;
  import_added: number;
  carry: Play[] | null;
  reached_back: string;
  synced_to: string;
  worked_at: string;
  time_zone: string;
}>;

type PageOptions = { page: number; from?: number; to?: number };

export type LastfmDeps = {
  due: (at: Date) => Promise<LastfmRow[]>;
  page: (user: string, options: PageOptions) => Promise<RecentPage>;
  /** The person's own zone, for an account that keeps none. */
  timeZoneOf: (userId: string) => Promise<string>;
  save: (userId: string, days: AlbumDay[]) => Promise<SaveDaysResult>;
  update: (userId: string, patch: LastfmPatch) => Promise<void>;
  finished: (userId: string, count: number) => Promise<void>;
};

const SYNC_EVERY_MS = 3_600_000;
const SYNC_BACK_MS = 26 * 3_600_000;
/** Pages one person gets per run, so several imports share the clock. */
const PAGES_PER_TURN = 20;
/** A carried day longer than this is saved as it is, rather than carried for ever. */
const CARRY_MAX = 5_000;
/** People started per run, the longest waiting first. */
const PEOPLE_PER_RUN = 50;

const carrySchema = z
  .array(
    z.object({
      at: z.number().finite(),
      artist: z.string(),
      album: z.string(),
      song: z.string(),
      ms: z.number().finite().nullable(),
    }),
  )
  .max(CARRY_MAX);

/** The plays an import carried over, as this file saved them; nothing when they aren't. */
export function parseCarry(value: unknown): Play[] {
  const parsed = carrySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const real = (): LastfmDeps => {
  const keys = lastfmKeys();
  const db = () => createAdminClient();
  return {
    due: async (at) => {
      if (!keys) return [];
      const stale = new Date(at.getTime() - SYNC_EVERY_MS).toISOString();
      const { data, error } = await db()
        .from("diary_sources")
        .select(
          "user_id, lastfm_user, state, import_to, import_page, import_added, carry, synced_to, time_zone",
        )
        .eq("source", "lastfm")
        .not("lastfm_user", "is", null)
        .or(`state.eq.importing,and(state.eq.syncing,synced_to.lt.${stale})`)
        .order("worked_at", { ascending: true, nullsFirst: true })
        .limit(PEOPLE_PER_RUN);
      if (error) throw error;
      return (data ?? []).flatMap((row): LastfmRow[] =>
        // The filter above leaves only importing and syncing rows with a name.
        row.lastfm_user && (row.state === "importing" || row.state === "syncing")
          ? [
              {
                ...row,
                lastfm_user: row.lastfm_user,
                state: row.state,
                carry: parseCarry(row.carry),
              },
            ]
          : [],
      );
    },
    page: (user, options) => {
      if (!keys) throw new Error("Last.fm has no keys");
      return recentTracks(user, options, keys);
    },
    timeZoneOf: async (userId) => canonicalZone(await readTimeZone(userId)) ?? "UTC",
    save: (userId, days) => saveAlbumDays(userId, "lastfm", days),
    update: async (userId, patch) => {
      const { error } = await db()
        .from("diary_sources")
        .update(patch)
        .eq("user_id", userId)
        .eq("source", "lastfm");
      if (error) throw error;
    },
    finished: (userId, count) => finishImport(userId, "lastfm", count),
  };
};

/** Plays split into the days that are finished and the oldest day, which may go on. */
export function splitOldestDay(plays: Play[], timeZone: string): { done: Play[]; carry: Play[] } {
  const first = plays[0];
  if (!first) return { done: [], carry: [] };
  let oldest = localDay(first.at, timeZone);
  for (const play of plays) {
    const day = localDay(play.at, timeZone);
    if (day < oldest) oldest = day;
  }
  const done: Play[] = [];
  const carry: Play[] = [];
  for (const play of plays) (localDay(play.at, timeZone) === oldest ? carry : done).push(play);
  return { done, carry };
}

const oldestOf = (plays: Play[]) =>
  plays.reduce((min, p) => Math.min(min, p.at), Number.POSITIVE_INFINITY);

/** The account's clock, and the patch that keeps it when it had none. */
async function clockOf(row: LastfmRow, deps: LastfmDeps) {
  const kept = canonicalZone(row.time_zone);
  if (kept) return { zone: kept, keep: {} };
  const zone = await deps.timeZoneOf(row.user_id);
  return { zone, keep: { time_zone: zone } };
}

/**
 * Whether this is the import's last page. Last.fm says how many pages there
 * are; an answer that doesn't say is tried again next run, rather than
 * taken as the end. An account with nothing played has no pages at all.
 */
function isLastPage(page: RecentPage): boolean {
  if (page.totalPages === null) throw new Error("Last.fm didn't say how many pages there are");
  if (page.totalPages === 0) {
    if (page.plays.length > 0) throw new Error("Last.fm sent plays on no pages");
    return true;
  }
  return page.page >= page.totalPages;
}

/** Whether a save found the diary full: nothing more goes in. */
const isFull = (saved: SaveDaysResult) =>
  saved.ok ? saved.skipped > 0 : saved.error === DIARY_FULL;

async function importTurn(
  row: LastfmRow,
  at: Date,
  deadline: number,
  deps: LastfmDeps,
  pages: number,
) {
  const { zone, keep: keepZone } = await clockOf(row, deps);
  const to = (row.import_to ? Date.parse(row.import_to) : at.getTime()) / 1000;
  let pageNumber = row.import_page ?? 1;
  let carry = row.carry ?? [];
  let added = row.import_added;
  for (let turn = 0; turn < pages && Date.now() < deadline; turn++) {
    const page = await deps.page(row.lastfm_user, { page: pageNumber, to });
    const last = isLastPage(page);
    const plays = [...carry, ...page.plays];
    const split = last ? { done: plays, carry: [] } : splitOldestDay(plays, zone);
    const keep = split.carry.length > CARRY_MAX ? { done: plays, carry: [] } : split;
    const saved = await deps.save(row.user_id, albumDays(keep.done, zone));
    // A full diary takes nothing more, so the import ends here, with what it added.
    const full = isFull(saved);
    if (!saved.ok && !full) throw new Error(saved.error);
    if (saved.ok) added += saved.added;
    carry = keep.carry;
    const oldest = oldestOf(plays);
    const reached =
      Number.isFinite(oldest) && !full ? { reached_back: new Date(oldest).toISOString() } : {};
    if (last || full) {
      await deps.update(row.user_id, {
        state: "syncing",
        import_page: null,
        import_added: added,
        carry: null,
        worked_at: at.toISOString(),
        ...reached,
        ...keepZone,
      });
      await deps.finished(row.user_id, added);
      return;
    }
    pageNumber += 1;
    await deps.update(row.user_id, {
      import_page: pageNumber,
      import_added: added,
      carry,
      worked_at: at.toISOString(),
      ...reached,
      ...keepZone,
    });
  }
}

/**
 * Reads back from 26 hours before the last sync. When that's more pages than
 * one turn allows (somebody connected again after weeks away, say), the
 * oldest pages are read first, so what's read runs unbroken from the start
 * and the next sync can carry on from the newest play it reached; reading
 * newest first, it would read the same pages every hour and never catch up.
 */
async function syncTurn(
  row: LastfmRow,
  at: Date,
  deadline: number,
  deps: LastfmDeps,
  pages: number,
) {
  const { zone, keep: keepZone } = await clockOf(row, deps);
  const since = row.synced_to ? Date.parse(row.synced_to) : at.getTime() - SYNC_BACK_MS;
  const from = (since - SYNC_BACK_MS) / 1000;
  const first = await deps.page(row.lastfm_user, { page: 1, from });
  const plays = [...first.plays];
  if (first.plays.length > 0 && first.totalPages === null) {
    throw new Error("Last.fm didn't say how many pages there are");
  }
  const total = first.plays.length === 0 ? 1 : Math.max(first.page, first.totalPages ?? 1);
  const behind = total > pages;
  // Newest first when it all fits; otherwise the oldest pages, upwards (at
  // least one, or a turn of one page would never move on).
  const rest = behind
    ? Array.from({ length: Math.max(1, pages - 1) }, (_, i) => total - i)
    : Array.from({ length: total - 1 }, (_, i) => i + 2);

  let read = 0;
  let reached = Number.NEGATIVE_INFINITY;
  for (const pageNumber of rest) {
    if (Date.now() >= deadline) break;
    const page = await deps.page(row.lastfm_user, { page: pageNumber, from });
    plays.push(...page.plays);
    for (const play of page.plays) reached = Math.max(reached, play.at);
    read += 1;
  }

  const saved = await deps.save(row.user_id, albumDays(plays, zone));
  // A full diary takes nothing more; moving on keeps the next sync from
  // reading the same plays again.
  if (!saved.ok && saved.error !== DIARY_FULL) throw new Error(saved.error);
  const syncedTo = !behind && read === rest.length ? at.getTime() : behind ? reached : null;
  await deps.update(row.user_id, {
    worked_at: at.toISOString(),
    ...(syncedTo !== null && syncedTo > since
      ? { synced_to: new Date(syncedTo).toISOString() }
      : {}),
    ...keepZone,
  });
}

export type LastfmReport = { people: number; errors: number };

/** One run: imports and due syncs, each person a turn, nobody new started after `deadline`. */
export async function advanceLastfm(
  at = new Date(),
  deadline = Date.now() + 15_000,
  deps: LastfmDeps = real(),
  options: { pagesPerTurn?: number } = {},
): Promise<LastfmReport> {
  const pages = Math.max(1, options.pagesPerTurn ?? PAGES_PER_TURN);
  const report: LastfmReport = { people: 0, errors: 0 };
  if (Date.now() >= deadline) return report;
  const rows = await deps.due(at);
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    report.people += 1;
    try {
      if (row.state === "importing") await importTurn(row, at, deadline, deps, pages);
      else await syncTurn(row, at, deadline, deps, pages);
    } catch (error) {
      if (needsReconnect(error)) {
        await deps
          .update(row.user_id, { state: "needs_reconnect", worked_at: at.toISOString() })
          .catch(() => undefined);
      } else {
        report.errors += 1;
        console.error(
          "[diary] Last.fm turn failed:",
          error instanceof Error ? error.message : error,
        );
        await deps.update(row.user_id, { worked_at: at.toISOString() }).catch(() => undefined);
      }
    }
  }
  return report;
}
