import "server-only";
import { z } from "zod";
import { rate } from "@/app/ratings/actions";
import type { DiaryBatchResult, SaveResult } from "@/lib/app-api";
import {
  ANNOUNCE_MIN,
  albumKey,
  DIARY_MAX,
  isDiaryDay,
  MIN_MINUTES,
  MIN_SONGS,
  NAME_MAX,
  tidy,
  type AlbumDay,
  type DiarySource,
  type ImportSource,
} from "@/lib/diary-shared";
import { diaryMessage } from "@/lib/push/messages";
import { later } from "@/lib/push/later";
import { sendPushes } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingColumn,
  isMissingFunction,
  isMissingTable,
  logQueryError,
} from "@/lib/supabase/errors";
import { mbidSchema } from "@/lib/validation";

/**
 * Everything that writes to the listening diary (migration 0025). Only the
 * website writes there, with the service role, always for a person the caller
 * has already checked, after these checks: the listen rule, real days and
 * names. The database keeps the size limit itself, in diary_merge.
 */

export const DIARY_NOT_YET = "The diary isn't available yet.";
export const DIARY_FULL = `Your diary is full: it holds ${DIARY_MAX.toLocaleString("en")} albums.`;
const TRY_AGAIN = "Couldn't save that. Please try again.";

const db = () => createAdminClient();

/** `skipped`: new album-days a nearly full diary had no room for. */
export type SaveDaysResult =
  { ok: true; added: number; merged: number; skipped: number } | { ok: false; error: string };

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
 * Imported album-days fit to keep: names tidied and the key worked out here
 * (never trusted), real days only, and only days that pass the listen rule.
 */
export function cleanDays(days: readonly AlbumDay[], now = Date.now()): AlbumDay[] {
  return days.flatMap((d) => {
    const artist = tidy(d.artist);
    const album = tidy(d.album);
    if (!artist || !album) return [];
    const key = albumKey(artist, album);
    // Names that fold to nothing (only punctuation) can't be matched or told apart.
    if (key.startsWith("|") || key.endsWith("|") || key.length < 3) return [];
    if (!isDiaryDay(d.day, now)) return [];
    if (d.songs < MIN_SONGS && d.minutes < MIN_MINUTES) return [];
    const songHint = d.songHint === null ? null : tidy(d.songHint) || null;
    return [{ ...d, key, artist, album, songHint }];
  });
}

/**
 * Saves album-days from one source. Imports are cleaned first; a listen
 * logged by hand comes with its album (`mbid`) and is saved as it is. A
 * diary with no room for any of the new ones says it's full.
 */
export async function saveAlbumDays(
  userId: string,
  source: DiarySource,
  days: readonly Outgoing[],
): Promise<SaveDaysResult> {
  const outgoing: Outgoing[] = source === "hand" ? [...days] : cleanDays(days);
  if (outgoing.length === 0) return { ok: true, added: 0, merged: 0, skipped: 0 };

  const { data, error } = await db().rpc("diary_merge", {
    p_user: userId,
    p_source: source,
    p_entries: outgoing,
  });
  if (error) {
    if (isMissingFunction(error) || isMissingTable(error)) {
      return { ok: false, error: DIARY_NOT_YET };
    }
    console.error("[diary] saving failed:", error.code ?? "", error.message);
    return { ok: false, error: TRY_AGAIN };
  }
  // The generated types call every column of a function's answer nullable.
  const row = (data ?? [])[0];
  const added = row?.added ?? 0;
  const skipped = row?.skipped ?? 0;
  if (added === 0 && skipped > 0) return { ok: false, error: DIARY_FULL };
  return { ok: true, added, merged: row?.merged ?? 0, skipped };
}

/** What an upload answers: how many albums were added and merged. */
export function batchResult(saved: SaveDaysResult): DiaryBatchResult {
  return saved.ok ? { ok: true, added: saved.added, merged: saved.merged } : saved;
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
  const record = { last_import_at: at.toISOString(), last_count: total };
  // Last.fm goes on syncing, its state the clock's to keep; only its own row
  // is updated, so a disconnect while the clock was reading isn't undone.
  const { error } =
    source === "lastfm"
      ? await db().from("diary_sources").update(record).eq("user_id", userId).eq("source", source)
      : await db()
          .from("diary_sources")
          .upsert(
            { user_id: userId, source, ...record, state: "idle" },
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

/**
 * Deletes one entry of your own. A name it alone was waiting to have matched
 * is forgotten too.
 */
export async function deleteEntry(userId: string, id: number): Promise<SaveResult> {
  const { data, error } = await db()
    .from("diary_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("album_key, release_mbid");
  if (error) return { ok: false, error: isMissingTable(error) ? DIARY_NOT_YET : TRY_AGAIN };
  const gone = data?.[0];
  if (!gone) return { ok: false, error: "Couldn't delete that entry." };
  if (!gone.release_mbid) {
    const { error: forgetError } = await db().rpc("diary_forget_names", {
      p_keys: [gone.album_key],
    });
    // The entry is gone either way; a name left over is only matched for nobody.
    if (forgetError) logQueryError("diary", forgetError);
  }
  return { ok: true };
}

/**
 * Forgets one source (for Last.fm that disconnects it) and removes
 * everything it sent, keeping entries another source sent too. The source
 * goes first, so the clock can't add to it in between. With `keepEntries`,
 * only the source is forgotten.
 */
export async function removeSource(
  userId: string,
  source: ImportSource,
  keepEntries = false,
): Promise<SaveResult> {
  const { error } = await db()
    .from("diary_sources")
    .delete()
    .eq("user_id", userId)
    .eq("source", source);
  if (error && !isMissingTable(error)) return { ok: false, error: TRY_AGAIN };
  if (keepEntries) return { ok: true };
  const { error: removeError } = await db().rpc("diary_remove_source", {
    p_user: userId,
    p_source: source,
  });
  if (removeError) {
    return { ok: false, error: isMissingFunction(removeError) ? DIARY_NOT_YET : TRY_AGAIN };
  }
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
  const [entryRead, releaseRead] = await Promise.all([
    client
      .from("diary_entries")
      .select("album_key")
      .eq("id", entryId)
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("releases").select("mbid").eq("mbid", mbid).maybeSingle(),
  ]);
  const readError = entryRead.error ?? releaseRead.error;
  if (readError) {
    if (isMissingTable(readError)) return { ok: false, error: DIARY_NOT_YET };
    logQueryError("diary", readError);
    return { ok: false, error: TRY_AGAIN };
  }
  const entry = entryRead.data;
  const release = releaseRead.data;
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
 * an ordinary rating once the listen is in, so a diary that can't take it
 * leaves no score behind. The album must already be in the catalogue (it
 * is, once its page has been opened). `rate` saves for whoever is signed
 * in, so `userId` must be them.
 */
export async function logListen(
  userId: string,
  listen: { mbid: string; day: string; score?: number },
): Promise<SaveResult> {
  if (!mbidSchema.safeParse(listen.mbid).success) return { ok: false, error: TRY_AGAIN };
  if (!isDiaryDay(listen.day)) return { ok: false, error: "Pick a day from 1900 up to today." };

  const { data: release, error } = await db()
    .from("releases")
    .select("mbid, title, artist_credit, artists ( name )")
    .eq("mbid", listen.mbid)
    .maybeSingle();
  if (error) {
    logQueryError("diary", error);
    return { ok: false, error: TRY_AGAIN };
  }
  if (!release) return { ok: false, error: "Open that album first, then try again." };

  const artist =
    tidy(release.artists?.name ?? "") || tidy(release.artist_credit ?? "") || "Unknown artist";
  const album = tidy(release.title) || "Untitled";
  const saved = await saveAlbumDays(userId, "hand", [
    {
      day: listen.day,
      key: albumKey(artist, album),
      artist,
      album,
      songHint: null,
      songs: 0,
      minutes: 0,
      plays: 0,
      mbid: listen.mbid,
    },
  ]);
  if (!saved.ok) return saved;

  if (listen.score !== undefined) {
    const rated = await rate("album", listen.mbid, listen.score);
    if (!rated.ok) return { ok: false, error: rated.error };
  }
  return { ok: true };
}
