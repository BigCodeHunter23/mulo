import "server-only";
import { cache } from "react";
import type {
  DiaryEntry,
  DiaryMonth,
  DiaryOwn,
  DiaryPage,
  DiarySourceStatus,
  Person,
} from "@/lib/app-api";
import { hiddenPeople } from "@/lib/blocks";
import { isDiaryDay, type DiarySource, type ImportSource } from "@/lib/diary-shared";
import { lastfmKeys } from "@/lib/diary/lastfm";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingColumn,
  isMissingFunction,
  isMissingTable,
  logQueryError,
} from "@/lib/supabase/errors";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { USERNAME_PATTERN } from "@/lib/validation";

/**
 * Reading the listening diary. Entries are read through the visitor's own
 * session, so a private diary, or one across a block, reads as nothing
 * (migration 0025's `diary_visible`). What only the owner sees comes from
 * the private tables with the service role, for the owner alone.
 */

export const PAGE_SIZE = 60;
const PROFILE_SIZE = 8;
/** `.in()` puts every key in the address, so long lists are read this many at a time. */
const CHUNK = 100;
/** Tries after which matching gives up on a name (migration 0025's `album_matches`). */
const MATCH_TRIES = 3;

const ENTRY =
  "id, day, artist_name, album_name, album_key, release_mbid, sources, songs, minutes, plays, releases ( mbid, title, cover_art_url, artist_credit )";

/** What the owner sees of their imports. Never the Last.fm session or a connect's state. */
const SOURCE_STATUS =
  "source, state, lastfm_user, reached_back, synced_to, last_import_at, last_count";

type EntryRow = {
  id: number;
  day: string;
  artist_name: string;
  album_name: string;
  album_key: string;
  release_mbid: string | null;
  sources: string[];
  songs: number;
  minutes: number;
  plays: number;
  releases: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    artist_credit: string | null;
  } | null;
};

/** A page's cursor, "<day>.<id>" of the last entry shown, or null for one that can't be. */
export function parseCursor(cursor: string | null): { day: string; id: number } | null {
  const match = cursor?.match(/^(\d{4}-\d{2}-\d{2})\.(\d{1,18})$/);
  if (!match?.[1] || !match[2] || !isDiaryDay(match[1])) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) ? { day: match[1], id } : null;
}

/**
 * Whose diary it is, and whether they keep it public. Usernames are unique
 * whatever their case (migration 0016); `ilike` reads "_" as any one
 * character, so it's escaped.
 */
async function owner(username: string): Promise<(Person & { diary_public: boolean }) | null> {
  if (!USERNAME_PATTERN.test(username)) return null;
  const name = username.replace(/_/g, "\\_");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, diary_public")
    .ilike("username", name)
    .maybeSingle();
  if (!error) return data;
  if (!isMissingColumn(error)) throw error;
  // Before 0025 there's no diary_public; read the person without it.
  const { data: plain } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .ilike("username", name)
    .maybeSingle();
  return plain ? { ...plain, diary_public: true } : null;
}

/** Which unmatched names matching has given up on. */
async function givenUp(keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data } = await createAdminClient()
      .from("album_matches")
      .select("album_key, tries")
      .in("album_key", keys.slice(i, i + CHUNK));
    for (const row of data ?? []) if (row.tries >= MATCH_TRIES) found.add(row.album_key);
  }
  return found;
}

/** The owner's own scores for these albums. */
async function scoresOf(userId: string, mbids: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (mbids.length === 0) return scores;
  const supabase = await createClient();
  for (let i = 0; i < mbids.length; i += CHUNK) {
    const { data } = await supabase
      .from("ratings")
      .select("release_mbid, score")
      .eq("user_id", userId)
      .in("release_mbid", mbids.slice(i, i + CHUNK));
    for (const row of data ?? []) scores.set(row.release_mbid, row.score);
  }
  return scores;
}

async function toEntries(userId: string, rows: EntryRow[]): Promise<DiaryEntry[]> {
  const mbids = [...new Set(rows.flatMap((r) => (r.release_mbid ? [r.release_mbid] : [])))];
  const unmatched = [...new Set(rows.filter((r) => !r.release_mbid).map((r) => r.album_key))];
  const [scores, gone] = await Promise.all([scoresOf(userId, mbids), givenUp(unmatched)]);
  return rows.map((row) => ({
    id: row.id,
    day: row.day,
    artist: row.artist_name,
    album: row.album_name,
    release: row.releases
      ? {
          mbid: row.releases.mbid,
          title: row.releases.title,
          cover: row.releases.cover_art_url,
          artist: row.releases.artist_credit,
        }
      : null,
    matching: row.release_mbid ? "matched" : gone.has(row.album_key) ? "none" : "pending",
    score: row.release_mbid ? (scores.get(row.release_mbid) ?? null) : null,
    // The column's check (migration 0025) allows only the DiarySource names.
    sources: row.sources as DiarySource[],
    songs: row.songs,
    minutes: row.minutes,
    plays: row.plays,
  }));
}

async function readOwn(userId: string, isPublic: boolean): Promise<DiaryOwn> {
  const supabase = await createClient();
  const [{ data: sources, error }, waiting] = await Promise.all([
    createAdminClient().from("diary_sources").select(SOURCE_STATUS).eq("user_id", userId),
    supabase.rpc("diary_waiting"),
  ]);
  if (error && !isMissingTable(error)) logQueryError("diary", error);
  return {
    public: isPublic,
    sources: (sources ?? []).map((row): DiarySourceStatus => ({
      // The columns' checks (migration 0025) allow only these names.
      source: row.source as ImportSource,
      state: row.state as DiarySourceStatus["state"],
      lastfmUser: row.lastfm_user,
      reachedBack: row.reached_back,
      syncedAt: row.synced_to,
      lastImportAt: row.last_import_at,
      lastCount: row.last_count,
    })),
    waiting: waiting.error ? 0 : (waiting.data ?? 0),
    lastfm: lastfmKeys() !== null,
  };
}

/** The lines of the months this page covers, from the first of its oldest month. */
async function readMonths(userId: string, rows: EntryRow[]): Promise<DiaryMonth[]> {
  const newest = rows[0]?.day;
  const oldest = rows[rows.length - 1]?.day;
  if (!newest || !oldest) return [];
  const { data, error } = await (
    await createClient()
  ).rpc("diary_months", {
    p_user: userId,
    p_from: `${oldest.slice(0, 7)}-01`,
    p_to: newest,
  });
  if (error) {
    if (!isMissingFunction(error)) logQueryError("diary", error);
    return [];
  }
  // The generated types call every column of a function's answer nullable.
  return (data ?? []).flatMap((row) =>
    row.month ? [{ month: row.month, albums: row.albums ?? 0, minutes: row.minutes ?? 0 }] : [],
  );
}

/**
 * A page of somebody's diary, newest first, for whoever's looking; null when
 * there's no such person or they're hidden from the viewer either way.
 */
async function readDiaryPage(username: string, before: string | null): Promise<DiaryPage | null> {
  const [person, viewer, hidden] = await Promise.all([
    owner(username),
    getCurrentUser(),
    hiddenPeople(),
  ]);
  if (!person || hidden.has(person.id)) return null;
  const { diary_public: isPublic, ...who } = person;
  const self = viewer?.id === person.id;
  if (!self && !isPublic) return { state: "private", person: who };

  const supabase = await createClient();
  let query = supabase
    .from("diary_entries")
    .select(ENTRY)
    .eq("user_id", person.id)
    .order("day", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  const cursor = parseCursor(before);
  if (cursor) {
    query = query.or(`day.lt.${cursor.day},and(day.eq.${cursor.day},id.lt.${cursor.id})`);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return { state: "unavailable", person: who };
    throw error;
  }
  const rows: EntryRow[] = data ?? [];
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const [entries, months, own] = await Promise.all([
    toEntries(person.id, page),
    readMonths(person.id, page),
    self ? readOwn(person.id, isPublic) : Promise.resolve(null),
  ]);
  return {
    state: "open",
    person: who,
    entries,
    months,
    next: rows.length > PAGE_SIZE && last ? `${last.day}.${last.id}` : null,
    own,
  };
}

/** One read per request, kept by React's cache, as a page and its metadata both ask. */
export const getDiaryPage = cache(readDiaryPage);

/**
 * The latest matched entries of somebody's diary for their profile, as the
 * viewer may see them (row-level security decides); empty before 0025.
 */
export async function recentListening(userId: string): Promise<DiaryEntry[]> {
  const { data, error } = await (
    await createClient()
  )
    .from("diary_entries")
    .select(ENTRY)
    .eq("user_id", userId)
    .not("release_mbid", "is", null)
    .order("day", { ascending: false })
    .order("id", { ascending: false })
    .limit(PROFILE_SIZE);
  if (error) {
    if (!isMissingTable(error)) logQueryError("diary", error);
    return [];
  }
  return toEntries(userId, data ?? []);
}

/** Your diary and imports for your copy of your data. Never the Last.fm session. */
export async function diaryCopyOf(userId: string): Promise<{
  entries: unknown[];
  sources: unknown[];
}> {
  const client = createAdminClient();
  const entries: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("diary_entries")
      .select(
        "day, artist_name, album_name, release_mbid, sources, songs, minutes, plays, created_at",
      )
      .eq("user_id", userId)
      .order("day")
      .order("id")
      .range(from, from + 999);
    if (error || !data) break;
    entries.push(...data);
    if (data.length < 1000) break;
  }
  const { data: sources } = await client
    .from("diary_sources")
    .select(SOURCE_STATUS)
    .eq("user_id", userId);
  return { entries, sources: sources ?? [] };
}
