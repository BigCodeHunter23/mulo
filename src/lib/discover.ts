import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export type AlbumSummary = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  year: string | null;
};

export type ArtistSummary = {
  mbid: string;
  name: string;
  image_url: string | null;
};

type ReleaseRow = {
  mbid: string;
  title: string;
  artist_credit: string | null;
  cover_art_url: string | null;
  release_date: string | null;
  artists: { name: string } | { name: string }[] | null;
};

const ALBUM_SELECT =
  "mbid, title, artist_credit, cover_art_url, release_date, artists ( name )";

function toAlbum(row: ReleaseRow): AlbumSummary {
  const joined = Array.isArray(row.artists) ? row.artists[0] : row.artists;
  return {
    mbid: row.mbid,
    title: row.title,
    artist: row.artist_credit ?? joined?.name ?? null,
    cover_art_url: row.cover_art_url,
    year: row.release_date?.slice(0, 4) ?? null,
  };
}

/** The albums people listen to most, by ListenBrainz listen counts. */
export async function mostPlayedAlbums(limit = 15): Promise<AlbumSummary[]> {
  const { data } = await createPublicClient()
    .from("releases")
    .select(ALBUM_SELECT)
    .not("popularity", "is", null)
    .neq("cover_art_url", "")
    .order("popularity", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as ReleaseRow[]).map(toAlbum);
}

/** Well-known artists with a photo, most-played first. */
export async function popularArtists(limit = 10): Promise<ArtistSummary[]> {
  const { data } = await createPublicClient()
    .from("artists")
    .select("mbid, name, image_url")
    .not("popularity", "is", null)
    .neq("image_url", "")
    .order("popularity", { ascending: false })
    .limit(limit);

  return (data ?? []) as ArtistSummary[];
}

/**
 * The best average scores from people's ratings on MULO. Averaging in code is
 * fine at soft-launch scale; past a few thousand ratings this belongs in a
 * database view.
 */
export async function topRatedOnMulo(
  limit = 10,
): Promise<(AlbumSummary & { average: number; count: number })[]> {
  const supabase = createPublicClient();
  const { data: ratings } = await supabase
    .from("ratings")
    .select("release_mbid, score")
    .limit(5000);

  const totals = new Map<string, { sum: number; count: number }>();
  for (const rating of ratings ?? []) {
    const total = totals.get(rating.release_mbid) ?? { sum: 0, count: 0 };
    total.sum += rating.score;
    total.count += 1;
    totals.set(rating.release_mbid, total);
  }

  const ranked = [...totals.entries()]
    .map(([mbid, t]) => ({ mbid, average: t.sum / t.count, count: t.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data: rows } = await supabase
    .from("releases")
    .select(ALBUM_SELECT)
    .in("mbid", ranked.map((r) => r.mbid));

  const albums = new Map(
    ((rows ?? []) as unknown as ReleaseRow[]).map((row) => [row.mbid, toAlbum(row)]),
  );

  return ranked.flatMap((r) => {
    const album = albums.get(r.mbid);
    return album ? [{ ...album, average: r.average, count: r.count }] : [];
  });
}

/** Mulberry32: small, fast, and the same sequence for the same seed. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffled, but only once an hour: come back later and the shelf has changed,
 * yet nothing moves under you while you browse, and every render on the server
 * agrees with the one before it.
 */
function rotate<T>(items: T[], offset = 0): T[] {
  const random = seeded(Math.floor(Date.now() / 3_600_000) + offset);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** How deep to go before shuffling: still names people know, but not only the top ten. */
const EXPLORE_POOL = 200;

/**
 * Artists worth a look, drawn from a wide pool rather than the same famous few.
 * The most popular still lead the pool, but which of them show up changes every
 * hour, so the shelf is never the same twice in a day.
 */
export async function artistsToExplore(limit = 10): Promise<ArtistSummary[]> {
  const { data } = await createPublicClient()
    .from("artists")
    .select("mbid, name, image_url")
    .not("popularity", "is", null)
    .neq("image_url", "")
    .order("popularity", { ascending: false })
    .limit(EXPLORE_POOL);

  return rotate((data ?? []) as ArtistSummary[]).slice(0, limit);
}

/** Albums out in the last few months, newest first. */
export async function newReleases(limit = 10): Promise<AlbumSummary[]> {
  const today = new Date();
  const since = new Date(today.getTime() - 180 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data } = await createPublicClient()
    .from("releases")
    .select(ALBUM_SELECT)
    .gte("release_date", since)
    .lte("release_date", today.toISOString().slice(0, 10))
    .neq("cover_art_url", "")
    .not("cover_art_url", "is", null)
    .order("release_date", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as ReleaseRow[]).map(toAlbum);
}

/** How many of an artist's own genre tags to match on. */
const GENRE_DEPTH = 6;

/**
 * Where to go next after an artist: other artists whose records are tagged
 * with the same genres, the closest match first. Everything comes from what
 * MULO has already cached, so there's no extra call out to MusicBrainz, and
 * the order rotates hourly so the same five names aren't always the answer.
 */
export async function similarArtists(
  mbid: string,
  limit = 6,
): Promise<ArtistSummary[]> {
  const supabase = createPublicClient();

  const { data: own } = await supabase
    .from("releases")
    .select("genres")
    .eq("artist_mbid", mbid)
    .limit(100);

  // The genres this artist is tagged with most often across their records.
  const counts = new Map<string, number>();
  for (const row of (own ?? []) as { genres: string[] }[]) {
    for (const genre of row.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  const mine = [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, GENRE_DEPTH)
    .map(([genre]) => genre);

  // No genres cached yet: fall back to artists worth exploring anyway.
  if (mine.length === 0) {
    return (await artistsToExplore(limit + 1))
      .filter((artist) => artist.mbid !== mbid)
      .slice(0, limit);
  }

  // Only records people actually listen to, so the suggestions are artists
  // somebody might have heard of rather than the deepest corner of the cache.
  const { data: neighbours } = await supabase
    .from("releases")
    .select("artist_mbid, genres")
    .overlaps("genres", mine)
    .not("popularity", "is", null)
    .not("artist_mbid", "is", null)
    .limit(2000);

  // Matching what this artist is best known for counts for more than
  // matching a tag they happen to share with half of music.
  const weight = new Map(mine.map((genre, i) => [genre, GENRE_DEPTH - i]));

  const shared = new Map<string, Set<string>>();
  for (const row of (neighbours ?? []) as {
    artist_mbid: string;
    genres: string[];
  }[]) {
    if (row.artist_mbid === mbid) continue;
    const hits = shared.get(row.artist_mbid) ?? new Set<string>();
    for (const genre of row.genres) {
      if (weight.has(genre)) hits.add(genre);
    }
    shared.set(row.artist_mbid, hits);
  }

  const ranked = [...shared.entries()]
    .map(([artist, hits]) => ({
      artist,
      score: [...hits].reduce((sum, genre) => sum + (weight.get(genre) ?? 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 4);

  if (ranked.length === 0) return [];

  const { data: artists } = await supabase
    .from("artists")
    .select("mbid, name, image_url, popularity")
    .in(
      "mbid",
      ranked.map((entry) => entry.artist),
    )
    .neq("image_url", "");

  const known = new Map(
    ((artists ?? []) as (ArtistSummary & { popularity: number | null })[]).map(
      (artist) => [artist.mbid, artist],
    ),
  );

  const best = ranked.flatMap((entry) => {
    const artist = known.get(entry.artist);
    return artist ? [{ ...artist, score: entry.score }] : [];
  });

  best.sort(
    (a, b) => b.score - a.score || (b.popularity ?? 0) - (a.popularity ?? 0),
  );

  // The closest few always lead, so the suggestions are believable; the rest
  // of the row rotates through the near misses, so coming back shows fresh
  // faces rather than the same six every time.
  const pool = best.slice(0, limit * 2);
  const lead = Math.ceil(limit / 2);
  const shown = [
    ...pool.slice(0, lead),
    ...rotate(pool.slice(lead), 7).slice(0, limit - lead),
  ];

  return shown.map(({ mbid: id, name, image_url }) => ({ mbid: id, name, image_url }));
}
