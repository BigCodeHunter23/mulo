import "server-only";
import { z } from "zod";
import { rate } from "@/app/ratings/actions";
import type { SaveResult } from "@/lib/app-api";
import {
  ANNOUNCE_MIN,
  albumKey,
  DIARY_MAX,
  isDiaryDay,
  MIN_MINUTES,
  MIN_SONGS,
  NAME_MAX,
  type AlbumDay,
  type DiarySource,
  type ImportSource,
} from "@/lib/diary-shared";
import { diaryMessage } from "@/lib/push/messages";
import { later } from "@/lib/push/later";
import { sendPushes } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn, isMissingFunction, isMissingTable } from "@/lib/supabase/errors";
import { mbidSchema } from "@/lib/validation";

/**
 * Everything that writes to the listening diary (migration 0025). Only the
 * website writes there, with the service role, always for a person the caller
 * has already checked, after these checks: the listen rule, the size limit,
 * real days and names.
 */

export const DIARY_NOT_YET = "The diary isn't available yet.";
export const DIARY_FULL = `Your diary is full: it holds ${DIARY_MAX.toLocaleString("en")} albums.`;
const TRY_AGAIN = "Couldn't save that. Please try again.";

const db = () => createAdminClient();

export type SaveDaysResult =
  { ok: true; added: number; merged: number } | { ok: false; error: string };

/** An album-day as the database function takes it; `mbid` when the album was chosen. */
type Outgoing = AlbumDay & { mbid?: string };

/** The shape an album-day must have when it comes from outside. */
export const albumDaySchema = z.object({
  day: z.string().max(10),
  key: z.string().max(NAME_MAX).optional().default(""),
  artist: z.string().min(1).max(NAME_MAX),
  album: z.string().min(1).max(NAME_MAX),
  songHint: z.string().max(NAME_MAX).nullable(),
  songs: z.number().int().min(0).max(10_000),
  minutes: z.number().int().min(0).max(1440),
  plays: z.number().int().min(0).max(1_000_000),
});

/**
 * Imported album-days fit to keep: the key worked out here (never trusted),
 * real days only, and only days that pass the listen rule.
 */
export function cleanDays(days: readonly AlbumDay[], now = Date.now()): AlbumDay[] {
  return days.flatMap((d) => {
    const key = albumKey(d.artist, d.album);
    // Names that fold to nothing (only punctuation) can't be matched or told apart.
    if (key.startsWith("|") || key.endsWith("|") || key.length < 3) return [];
    if (!isDiaryDay(d.day, now)) return [];
    if (d.songs < MIN_SONGS && d.minutes < MIN_MINUTES) return [];
    return [{ ...d, key }];
  });
}

async function entryCount(userId: string): Promise<{ count: number } | { error: string }> {
  const { count, error } = await db()
    .from("diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return { error: isMissingTable(error) ? DIARY_NOT_YET : TRY_AGAIN };
  return { count: count ?? 0 };
}

/**
 * Saves album-days from one source. Imports are cleaned first; a listen
 * logged by hand comes with its album (`mbid`) and is saved as it is.
 */
export async function saveAlbumDays(
  userId: string,
  source: DiarySource,
  days: readonly Outgoing[],
): Promise<SaveDaysResult> {
  const outgoing: Outgoing[] = source === "hand" ? [...days] : cleanDays(days);
  if (outgoing.length === 0) return { ok: true, added: 0, merged: 0 };

  const counted = await entryCount(userId);
  if ("error" in counted) return { ok: false, error: counted.error };
  const room = DIARY_MAX - counted.count;
  if (room <= 0) return { ok: false, error: DIARY_FULL };

  const { data, error } = await db().rpc("diary_merge", {
    p_user: userId,
    p_source: source,
    p_entries: outgoing.slice(0, room),
  });
  if (error) {
    if (isMissingFunction(error) || isMissingTable(error)) {
      return { ok: false, error: DIARY_NOT_YET };
    }
    console.error("[diary] saving failed:", error.code ?? "", error.message);
    return { ok: false, error: TRY_AGAIN };
  }
  const row = (data ?? [])[0];
  return { ok: true, added: row?.added ?? 0, merged: row?.merged ?? 0 };
}

/**
 * Records a finished import for the bell, and pushes when it's worth it: a
 * Last.fm import always; an upload from 20 albums. Once a day per source.
 * `sendPushes` checks the Diary switch itself.
 */
export async function finishImport(
  userId: string,
  source: ImportSource,
  count: number,
  at = new Date(),
): Promise<void> {
  const total = Math.max(0, Math.min(DIARY_MAX, Math.round(count)));
  const { error } = await db()
    .from("diary_sources")
    .upsert(
      {
        user_id: userId,
        source,
        last_import_at: at.toISOString(),
        last_count: total,
        // Last.fm goes on syncing; the clock keeps its state.
        ...(source === "lastfm" ? {} : { state: "idle" }),
      },
      { onConflict: "user_id,source" },
    );
  if (error) console.error("[diary] recording an import failed:", error.code ?? "", error.message);

  if (total === 0 || (source !== "lastfm" && total < ANNOUNCE_MIN)) return;
  later(() =>
    sendPushes([
      {
        userId,
        kind: "diary",
        key: `diary-import-${source}-${at.toISOString().slice(0, 10)}`,
        ...diaryMessage(source, total),
      },
    ]),
  );
}

/** Deletes one entry of your own. */
export async function deleteEntry(userId: string, id: number): Promise<SaveResult> {
  const { data, error } = await db()
    .from("diary_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) return { ok: false, error: isMissingTable(error) ? DIARY_NOT_YET : TRY_AGAIN };
  if (!data || data.length === 0) return { ok: false, error: "Couldn't delete that entry." };
  return { ok: true };
}

/**
 * Removes everything one source sent (keeping entries another source sent
 * too), and forgets the source: for Last.fm that disconnects it. With
 * `keepEntries`, only the source is forgotten.
 */
export async function removeSource(
  userId: string,
  source: ImportSource,
  keepEntries = false,
): Promise<SaveResult> {
  if (!keepEntries) {
    const { error } = await db().rpc("diary_remove_source", { p_user: userId, p_source: source });
    if (error) {
      return { ok: false, error: isMissingFunction(error) ? DIARY_NOT_YET : TRY_AGAIN };
    }
  }
  const { error } = await db()
    .from("diary_sources")
    .delete()
    .eq("user_id", userId)
    .eq("source", source);
  if (error && !isMissingTable(error)) return { ok: false, error: TRY_AGAIN };
  return { ok: true };
}

/**
 * "Which album is this?": points every one of your entries with that entry's
 * names at the album you chose. Never the shared table, so nobody can point a
 * name at the wrong album for everyone. The album must be in the catalogue.
 */
export async function fixAlbum(userId: string, entryId: number, mbid: string): Promise<SaveResult> {
  if (!mbidSchema.safeParse(mbid).success) return { ok: false, error: TRY_AGAIN };
  const client = db();
  const [{ data: entry }, { data: release }] = await Promise.all([
    client
      .from("diary_entries")
      .select("album_key")
      .eq("id", entryId)
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("releases").select("mbid").eq("mbid", mbid).maybeSingle(),
  ]);
  if (!entry) return { ok: false, error: "We couldn't find that entry." };
  if (!release) return { ok: false, error: "Open that album first, then try again." };
  const { error } = await client
    .from("diary_entries")
    .update({ release_mbid: mbid, fixed: true })
    .eq("user_id", userId)
    .eq("album_key", entry.album_key);
  return error ? { ok: false, error: TRY_AGAIN } : { ok: true };
}

/** Show my diary, on or off. */
export async function setDiaryPublic(userId: string, value: boolean): Promise<SaveResult> {
  const { error } = await db().from("profiles").update({ diary_public: value }).eq("id", userId);
  if (error) return { ok: false, error: isMissingColumn(error) ? DIARY_NOT_YET : TRY_AGAIN };
  return { ok: true };
}

/**
 * Log a listen: an album on a day, by hand, with an optional score saved as
 * an ordinary rating first. The album must already be in the catalogue
 * (it is, once its page has been opened). `rate` saves for whoever is signed
 * in, so `userId` must be them.
 */
export async function logListen(
  userId: string,
  listen: { mbid: string; day: string; score?: number },
): Promise<SaveResult> {
  if (!mbidSchema.safeParse(listen.mbid).success) return { ok: false, error: TRY_AGAIN };
  if (!isDiaryDay(listen.day)) return { ok: false, error: "Pick a day from 1900 up to today." };

  const { data: release } = await db()
    .from("releases")
    .select("mbid, title, artist_credit, artists ( name )")
    .eq("mbid", listen.mbid)
    .maybeSingle();
  if (!release) return { ok: false, error: "Open that album first, then try again." };

  if (listen.score !== undefined) {
    const rated = await rate("album", listen.mbid, listen.score);
    if (!rated.ok) return { ok: false, error: rated.error };
  }

  const artist = release.artists?.name ?? release.artist_credit ?? "Unknown artist";
  const saved = await saveAlbumDays(userId, "hand", [
    {
      day: listen.day,
      key: albumKey(artist, release.title),
      artist,
      album: release.title,
      songHint: null,
      songs: 0,
      minutes: 0,
      plays: 0,
      mbid: listen.mbid,
    },
  ]);
  return saved.ok ? { ok: true } : saved;
}
