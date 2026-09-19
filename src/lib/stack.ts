import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRaisedOn } from "@/lib/raised-on";
import { GENRE_FAMILIES, familiesFor } from "@/lib/badge-catalog";
import { playCounts } from "@/lib/hits";

/**
 * The Stack: a run of records to rate quickly, picked for one person.
 *
 * A rating site is only as good as the number of ratings in it, and the
 * slowest way to get them is one album page at a time. The fix is a short,
 * fast run of records somebody is likely to have actually heard — the point
 * being that a run of forty albums you know beats a list of a hundred you
 * don't.
 *
 * "Likely to have heard" is worked out from what MULO already knows:
 *
 *   1. The decade and scene they picked in Raised On. Somebody raised on
 *      nineties hip hop should not be handed the same list as somebody raised
 *      on seventies rock, which is exactly what a single popularity list does.
 *   2. Artists they have already rated — the rest of that artist's records are
 *      the safest bet on the board.
 *   3. Genres they rate in, matched through the same twelve families the badge
 *      ladders and The Charts use.
 *   4. Plain popularity, to fill the rest and to carry a brand new account
 *      that has told us nothing yet.
 *
 * Nothing here is stored. The run is worked out fresh each time, so it always
 * reflects what somebody has rated up to that moment.
 */

export type StackAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
  /** Why it's in the run, shown as a quiet line under the cover. */
  reason: string | null;
  /**
   * The album's biggest songs, to jog a memory. A cover and a title often
   * aren't enough to place a record — the moment somebody reads a song they
   * know, they can score it honestly instead of guessing or skipping.
   */
  hits: StackHit[];
  /** True when the order is by plays; false when it fell back to track order. */
  hitsByPlays: boolean;
};

export type StackHit = {
  title: string;
  /** Plays relative to the album's biggest song, 0 to 1, for the bar. */
  share: number;
};

/** Enough to recognise a record by, without turning a card into a list. */
const HITS_SHOWN = 4;

/** Points for each reason a record might be one somebody knows. */
const WEIGHT = {
  ratedArtist: 100,
  era: 45,
  genre: 30,
  /** A card with its hits on it is a far easier call than a bare cover. */
  tracklist: 20,
};

/** Read enough of the catalogue to choose from without pulling all of it. */
const POOL = 900;

type Row = {
  mbid: string;
  title: string;
  artist_mbid: string | null;
  artist_credit: string | null;
  cover_art_url: string | null;
  release_date: string | null;
  genres: string[] | null;
  popularity: number | null;
  tracks_cached_at: string | null;
};

/** The decade a release belongs to, as a number: 1994 becomes 1990. */
function decadeOf(releaseDate: string | null): number | null {
  const year = Number(releaseDate?.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? Math.floor(year / 10) * 10 : null;
}

/**
 * The full year behind an era id. `eras.ts` writes them two digits at a time —
 * "60s", "90s", "00s", "20s" — so the century has to be put back: sixties
 * through nineties belong to the nineteen hundreds, the rest to the two
 * thousands.
 */
function decadeFromEra(eraId: string | null | undefined): number | null {
  const digits = String(eraId ?? "").match(/^(\d{2})s$/);
  if (!digits) return null;

  const decade = Number(digits[1]);
  return decade >= 60 ? 1900 + decade : 2000 + decade;
}

/**
 * A run of albums for somebody to rate, best guesses first and never anything
 * they have already scored.
 */
export async function getStack(
  userId: string,
  limit = 40,
  /** Narrow the run to one decade (1990) and/or one genre family ("hip-hop"). */
  filter: { decade?: number | null; genre?: string | null } = {},
): Promise<StackAlbum[]> {
  const supabase = await createClient();

  const [raised, { data: mine }, { data: myArtists }] = await Promise.all([
    getRaisedOn(userId),
    supabase.from("ratings").select("release_mbid, score").eq("user_id", userId),
    supabase.from("artist_ratings").select("artist_mbid").eq("user_id", userId),
  ]);

  const rated = new Set((mine ?? []).map((row) => row.release_mbid as string));

  // Which albums are already rated tells us which artists and genres are
  // familiar, so the run can lean that way without repeating anything.
  const { data: ratedRows } = rated.size
    ? await supabase
        .from("releases")
        .select("artist_mbid, genres")
        .in("mbid", [...rated])
    : { data: [] as { artist_mbid: string | null; genres: string[] | null }[] };

  const knownArtists = new Set<string>();
  for (const row of (myArtists ?? []) as { artist_mbid: string }[]) {
    knownArtists.add(row.artist_mbid);
  }
  const familyHits = new Map<string, number>();
  for (const row of (ratedRows ?? []) as {
    artist_mbid: string | null;
    genres: string[] | null;
  }[]) {
    if (row.artist_mbid) knownArtists.add(row.artist_mbid);
    for (const family of familiesFor(row.genres ?? [])) {
      familyHits.set(family, (familyHits.get(family) ?? 0) + 1);
    }
  }

  // The decade they were raised on, and their record's own artist, are the
  // strongest hints a brand new account gives us.
  const eraDecade = decadeFromEra(raised?.era?.id);
  // A scene carries its genre in both its id ("rap") and its name ("Ringtone
  // rap"), and either can be the one that matches a family.
  const sceneGenres = new Set(
    familiesFor(
      [raised?.scene?.id, raised?.scene?.name].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );

  // A filtered run reads deeper into the catalogue, since most of the
  // most-played pool won't match; the database hands over a thousand at most
  // per request, so it's read a page at a time.
  const depth = filter.genre ? POOL * 4 : filter.decade ? POOL * 2 : POOL;
  const pool: Row[] = [];
  for (let from = 0; from < depth; from += 1000) {
    const columns =
      "mbid, title, artist_mbid, artist_credit, cover_art_url, release_date, genres, popularity, tracks_cached_at";
    const to = Math.min(from + 1000, depth) - 1;
    const { data } = filter.decade
      ? await supabase
          .from("releases")
          .select(columns)
          .not("cover_art_url", "is", null)
          .gte("release_date", `${filter.decade}-01-01`)
          .lt("release_date", `${filter.decade + 10}-01-01`)
          .order("popularity", { ascending: false, nullsFirst: false })
          .range(from, to)
      : await supabase
          .from("releases")
          .select(columns)
          .not("cover_art_url", "is", null)
          .order("popularity", { ascending: false, nullsFirst: false })
          .range(from, to);
    pool.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const scored = pool
    .filter((row) => !rated.has(row.mbid))
    .filter((row) => !filter.genre || familiesFor(row.genres ?? []).includes(filter.genre))

    .map((row, index) => {
      let score = 0;
      let reason: string | null = null;

      if (row.artist_mbid && knownArtists.has(row.artist_mbid)) {
        score += WEIGHT.ratedArtist;
        reason = row.artist_credit
          ? `Because you rate ${row.artist_credit}`
          : "Because you rate this artist";
      }

      const decade = decadeOf(row.release_date);
      if (eraDecade !== null && decade === eraDecade) {
        score += WEIGHT.era;
        reason ??= `From the ${eraDecade}s, the decade you were raised on`;
      }

      const families = familiesFor(row.genres ?? []);
      for (const family of families) {
        if (familyHits.has(family)) score += WEIGHT.genre;
        if (sceneGenres.has(family)) score += WEIGHT.genre;
      }
      const liked = families.find((f) => familyHits.has(f));
      if (reason === null && liked) {
        const name = GENRE_FAMILIES.find((f) => f.id === liked)?.name;
        reason = name ? `More ${name.toLowerCase()} for you` : "In a genre you rate";
      }

      if (row.tracks_cached_at) score += WEIGHT.tracklist;

      // Popularity is the tie-breaker and the floor. The pool already arrives
      // most-played first, so its position stands in for the listen count and
      // keeps one enormous artist from swamping the run.
      score += (pool.length - index) / pool.length;

      return { row, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  const run = spread(pickVaried(scored, limit), limit);

  const hits = await hitsForAlbums(run.map(({ row }) => row.mbid));

  return run.map(({ row, reason }) => {
    const found = hits.get(row.mbid) ?? { hits: [], byPlays: false };
    return {
      mbid: row.mbid,
      title: row.title,
      artist: row.artist_credit,
      cover: row.cover_art_url,
      year: row.release_date ? row.release_date.slice(0, 4) : null,
      reason,
      hits: found.hits,
      hitsByPlays: found.byPlays,
    };
  });
}

/**
 * The songs each album is known by, for a card that has to be placed at a
 * glance. Shared by The Stack and The Gauntlet.
 *
 * Tracklists are read only if already cached — fetching forty from
 * MusicBrainz at a request a second would take longer than the run itself —
 * and every song across all of them is looked up in one request.
 */
export async function hitsForAlbums(
  mbids: string[],
): Promise<Map<string, { hits: StackHit[]; byPlays: boolean }>> {
  const result = new Map<string, { hits: StackHit[]; byPlays: boolean }>();
  if (mbids.length === 0) return result;

  const supabase = await createClient();
  const { data: trackRows } = await supabase
    .from("tracks")
    .select("release_mbid, position, title, song_mbid")
    .in("release_mbid", mbids)
    .order("position", { ascending: true })
    .limit(3000);

  type TrackRow = {
    release_mbid: string;
    position: number;
    title: string;
    song_mbid: string | null;
  };
  const rows = (trackRows ?? []) as TrackRow[];

  const plays = await playCounts(
    rows.map((track) => track.song_mbid).filter((id): id is string => Boolean(id)),
  );

  const byAlbum = new Map<string, TrackRow[]>();
  for (const track of rows) {
    byAlbum.set(track.release_mbid, [...(byAlbum.get(track.release_mbid) ?? []), track]);
  }

  for (const [mbid, list] of byAlbum) {
    const counted = list.map((track) => ({
      title: track.title,
      plays: track.song_mbid ? (plays.get(track.song_mbid) ?? 0) : 0,
    }));

    const top = Math.max(0, ...counted.map((track) => track.plays));
    // No play counts to go on: the opening tracks are the next best thing.
    if (top === 0) {
      result.set(mbid, {
        hits: counted.slice(0, HITS_SHOWN).map((track) => ({ title: track.title, share: 0 })),
        byPlays: false,
      });
      continue;
    }

    // The same song can sit on a record twice (a remix, a reprise); show it once.
    const seen = new Set<string>();
    const hits = counted
      .sort((a, b) => b.plays - a.plays)
      .filter((track) => {
        const key = track.title.toLowerCase().replace(/\s*[([].*$/, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, HITS_SHOWN)
      .map((track) => ({ title: track.title, share: track.plays / top }));

    result.set(mbid, { hits, byPlays: true });
  }

  return result;
}
type Scored = { row: Row; score: number; reason: string | null };

/**
 * How deep to reach for a run. Taking the top forty every time meant the same
 * forty records came back run after run, minus whatever got rated — so anyone
 * who skipped a few was handed them straight back. Drawing forty out of a
 * few hundred good candidates keeps every run recognisably theirs while making
 * each one different from the last.
 */
const CANDIDATES = 250;

/**
 * A run drawn from the best candidates, favouring the top without being stuck
 * to it. Squaring a random number bends the draw towards the front of the
 * list, so the strongest picks still lead most of the time and a record that
 * was skipped last time isn't guaranteed to reappear.
 */
function pickVaried(scored: Scored[], limit: number): Scored[] {
  const pool = scored.slice(0, Math.max(CANDIDATES, limit));
  const picked: Scored[] = [];

  while (pool.length > 0 && picked.length < limit) {
    const at = Math.floor(Math.random() ** 2 * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }

  // Ordering within the run should still be best-first, so the strongest
  // records are the ones somebody definitely reaches.
  return picked.sort((a, b) => b.score - a.score);
}

/**
 * Take the best of the run, but never more than a few in a row by the same
 * artist. Eight Kendrick albums back to back is a chore however well it scores;
 * variety is what keeps somebody tapping to the end.
 */
const MAX_PER_ARTIST = 3;

function spread(scored: Scored[], limit: number): Scored[] {
  const taken: Scored[] = [];
  const held: Scored[] = [];
  const count = new Map<string, number>();

  for (const entry of scored) {
    if (taken.length >= limit) break;
    const artist = entry.row.artist_mbid ?? entry.row.mbid;
    const seen = count.get(artist) ?? 0;

    if (seen >= MAX_PER_ARTIST) {
      held.push(entry);
      continue;
    }
    count.set(artist, seen + 1);
    taken.push(entry);
  }

  // If holding records back left the run short, put them back rather than
  // hand somebody a run of twelve.
  for (const entry of held) {
    if (taken.length >= limit) break;
    taken.push(entry);
  }

  return taken;
}

