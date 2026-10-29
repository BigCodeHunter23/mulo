import "server-only";
import { foldName, sameAlbum, withoutEdition } from "@/lib/diary-shared";
import {
  groupsOf,
  listenbrainzToken,
  lookupRecordings,
  type Group,
  type LookupHit,
  type LookupItem,
} from "@/lib/diary/listenbrainz";
import {
  coverArtUrl,
  creditText,
  findReleaseGroups,
  MbNotFoundError,
  type MbReleaseGroup,
} from "@/lib/musicbrainz";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Matching the names in people's diaries to MULO's albums, on the clock.
 * Each name ("artist|album", folded) is looked up once for everybody:
 * ListenBrainz in bulk first, by one of its songs, then MusicBrainz's search,
 * one a second. A found album goes into the catalogue with what the lookup
 * gave, and its page fetches the rest on its first visit. Nothing found
 * counts a try, waiting an hour, then six; after three it's "no match" and
 * its owners can say which album it is. A service failing counts nothing.
 *
 * Names are taken in turns between the diaries that brought them in, a few
 * each a run, so one huge upload can't keep everybody else's waiting.
 */

export type Pending = {
  album_key: string;
  artist_name: string;
  album_name: string;
  song_hint: string | null;
  tries: number;
  /** Whose diary brought the name in; null once their account has gone. */
  added_by: string | null;
};

export type Found = Group & { artistMbid?: string | null };

export type MatchDeps = {
  pending: (at: Date, limit: number) => Promise<Pending[]>;
  token: string | null;
  lookup: (items: LookupItem[]) => Promise<(LookupHit | null)[]>;
  groups: (recordings: string[]) => Promise<Map<string, Group>>;
  search: (artist: string, album: string) => Promise<MbReleaseGroup[]>;
  saveAlbum: (found: Found) => Promise<void>;
  matched: (key: string, mbid: string, by: "listenbrainz" | "musicbrainz") => Promise<void>;
  missed: (key: string, tries: number, nextTry: Date) => Promise<void>;
  failed: (key: string, nextTry: Date) => Promise<void>;
};

/** Names due read per run, the longest waiting first, to take turns from. */
const POOL = 500;
/** Names taken per run… */
const BATCH = 100;
/** …and from any one person's diary. */
const PER_PERSON = 10;
/** Names asked of ListenBrainz per run: one lookup, and one ask for their albums. */
const LISTENBRAINZ_MAX = 50;
const RETRY_AFTER_FAILURE_MS = 15 * 60_000;
/** The wait after each try that found nothing: an hour, then six. */
const WAITS_MS = [3_600_000, 6 * 3_600_000];

const real = (): MatchDeps => {
  const db = () => createAdminClient();
  const token = listenbrainzToken();
  return {
    pending: async (at, limit) => {
      const { data, error } = await db()
        .from("album_matches")
        .select("album_key, artist_name, album_name, song_hint, tries, added_by")
        .is("release_mbid", null)
        .lt("tries", 3)
        .lte("next_try_at", at.toISOString())
        .order("next_try_at")
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    token,
    lookup: (items) => lookupRecordings(items, token ?? ""),
    groups: (recordings) => groupsOf(recordings),
    search: findReleaseGroups,
    saveAlbum: async (found) => {
      const client = db();
      let artistMbid: string | null = null;
      if (found.artistMbid && found.artist) {
        const { error } = await client
          .from("artists")
          .upsert(
            { mbid: found.artistMbid, name: found.artist },
            { onConflict: "mbid", ignoreDuplicates: true },
          );
        // Without its artist the album is still worth keeping; the album
        // page links it on its first visit.
        if (!error) artistMbid = found.artistMbid;
      }
      const { error } = await client.from("releases").upsert(
        {
          mbid: found.group,
          title: found.title,
          artist_mbid: artistMbid,
          artist_credit: found.artist,
          cover_art_url: coverArtUrl(found.group),
        },
        { onConflict: "mbid", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    matched: async (key, mbid, by) => {
      const client = db();
      const { error } = await client
        .from("album_matches")
        .update({ release_mbid: mbid, matched_by: by, tried_at: new Date().toISOString() })
        .eq("album_key", key);
      if (error) throw error;
      // Entries somebody pointed at an album themselves keep their choice.
      const { error: entriesError } = await client
        .from("diary_entries")
        .update({ release_mbid: mbid })
        .eq("album_key", key)
        .is("release_mbid", null)
        .eq("fixed", false);
      if (entriesError) throw entriesError;
    },
    missed: async (key, tries, nextTry) => {
      const { error } = await db()
        .from("album_matches")
        .update({ tries, next_try_at: nextTry.toISOString(), tried_at: new Date().toISOString() })
        .eq("album_key", key);
      if (error) throw error;
    },
    failed: async (key, nextTry) => {
      const { error } = await db()
        .from("album_matches")
        .update({ next_try_at: nextTry.toISOString() })
        .eq("album_key", key);
      if (error) throw error;
    },
  };
};

/** The MusicBrainz album that is this name, if one of the search's answers is. */
function pick(groups: MbReleaseGroup[], name: Pending): Found | null {
  const artist = foldName(name.artist_name);
  for (const group of groups) {
    if (!sameAlbum(group.title, name.album_name)) continue;
    const credit = creditText(group["artist-credit"] ?? []) ?? "";
    const folded = foldName(credit);
    if (credit && !folded.includes(artist) && !artist.includes(folded)) continue;
    return {
      group: group.id,
      title: group.title,
      artist: credit || null,
      artistMbid: group["artist-credit"]?.[0]?.artist?.id ?? null,
    };
  }
  return null;
}

export type MatchReport = { matched: number; missed: number; errors: number };

const reason = (error: unknown) => (error instanceof Error ? error.message : error);

/**
 * Names taken in turns, one from each person's diary in the order they came
 * up, then round again: at most `perPerson` each and `limit` in all. Names
 * whose diary has gone count as one more person.
 */
export function fairTurns(names: readonly Pending[], perPerson: number, limit: number): Pending[] {
  const queues = new Map<string | null, Pending[]>();
  for (const name of names) {
    const queue = queues.get(name.added_by);
    if (queue) queue.push(name);
    else queues.set(name.added_by, [name]);
  }
  const taken: Pending[] = [];
  for (let round = 0; round < perPerson; round++) {
    for (const queue of queues.values()) {
      const name = queue[round];
      if (name) taken.push(name);
      if (taken.length >= limit) return taken;
    }
  }
  return taken;
}

/**
 * One run of matching, until `deadline`. Whatever's left waits for the next
 * run, already due.
 */
export async function runMatcher(
  at = new Date(),
  deadline = Date.now() + 15_000,
  deps: MatchDeps = real(),
): Promise<MatchReport> {
  const report: MatchReport = { matched: 0, missed: 0, errors: 0 };
  if (Date.now() >= deadline) return report;
  const names = fairTurns(await deps.pending(at, POOL), PER_PERSON, BATCH);
  const left = new Map(names.map((n) => [n.album_key, n]));
  const late = () => Date.now() >= deadline;

  const settle = async (name: Pending, found: Found, by: "listenbrainz" | "musicbrainz") => {
    await deps.saveAlbum(found);
    await deps.matched(name.album_key, found.group, by);
    left.delete(name.album_key);
    report.matched += 1;
  };

  // 1. ListenBrainz, for names with a song to look up by, until the
  // deadline. Anything it can't place, or has no time for, goes on to
  // MusicBrainz, or waits for the next run.
  const bySong = names.filter((n) => n.song_hint).slice(0, LISTENBRAINZ_MAX);
  if (deps.token && bySong.length > 0) {
    try {
      const hits = await deps.lookup(
        bySong.map((n) => ({
          artist: n.artist_name,
          album: n.album_name,
          song: n.song_hint ?? "",
        })),
      );
      const recordings = hits.flatMap((hit) => (hit ? [hit.recording] : []));
      const groups =
        recordings.length > 0 && !late() ? await deps.groups(recordings) : new Map<string, Group>();
      for (const [index, name] of bySong.entries()) {
        if (late()) break;
        const hit = hits[index];
        const group = hit ? groups.get(hit.recording) : undefined;
        // A song's release can be a compilation; only the album itself will do.
        if (!group || !sameAlbum(group.title, name.album_name)) continue;
        try {
          await settle(name, group, "listenbrainz");
        } catch (error) {
          report.errors += 1;
          console.error("[diary] saving a match failed:", reason(error));
        }
      }
    } catch (error) {
      report.errors += 1;
      console.error("[diary] ListenBrainz failed:", reason(error));
    }
  }

  // 2. MusicBrainz for the rest, one a second, until the deadline.
  for (const name of [...left.values()]) {
    if (late()) break;
    try {
      let found: Found | null = null;
      try {
        found = pick(await deps.search(name.artist_name, withoutEdition(name.album_name)), name);
      } catch (error) {
        // A search MusicBrainz won't read finds nothing, now or later.
        if (!(error instanceof MbNotFoundError)) throw error;
      }
      if (found) {
        await settle(name, found, "musicbrainz");
        continue;
      }
      const tries = name.tries + 1;
      const wait = WAITS_MS[Math.min(tries, WAITS_MS.length) - 1] ?? 0;
      await deps.missed(name.album_key, tries, new Date(at.getTime() + wait));
      left.delete(name.album_key);
      report.missed += 1;
    } catch (error) {
      report.errors += 1;
      left.delete(name.album_key);
      await deps
        .failed(name.album_key, new Date(at.getTime() + RETRY_AFTER_FAILURE_MS))
        .catch(() => undefined);
      console.error("[diary] MusicBrainz failed:", reason(error));
    }
  }
  return report;
}
