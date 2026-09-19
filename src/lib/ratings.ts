import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getFollowingIds } from "@/lib/social";
import { RATING_TABLES, type RatingKind } from "@/lib/rating-kinds";

/** Named to match the mockups: Ovr / You / Friends. */
export type Scores = {
  overall: number | null;
  overallCount: number;
  you: number | null;
  friends: number | null;
  friendsCount: number;
  /**
   * True while the overall score still leans on the starting score borrowed
   * from MusicBrainz, so a page can say so rather than passing an outside
   * number off as MULO's own. See `supabase/migrations/0014_seed_ratings.sql`.
   */
  seeded: boolean;
};

/**
 * Past this many real MULO ratings the borrowed starting score is dropped.
 * By then MULO has an answer of its own and an outside number would only
 * muddy it; below it, one extra vote is the difference between a page with a
 * score on it and a page with a dash.
 */
const SEED_RETIRES_AT = 10;

/** Where each kind's seed lives, since seeds sit on the catalogue row. */
const SEED_TABLES = {
  album: "releases",
  artist: "artists",
} as const;

/**
 * When MusicBrainz has no rating for an album, its artist usually has one —
 * about nine in ten of the albums that came back empty belong to an artist
 * that didn't. Rather than leave those on a dash, the album borrows its
 * artist's score.
 *
 * It gets pulled towards the middle on the way, because an artist averaging
 * 8.7 does not mean every record they made is an 8.7 — it means their good
 * ones are and their weakest aren't. Six parts artist to four parts the middle
 * of the scale keeps the ranking roughly right while refusing to claim more
 * than the evidence supports. It still only ever counts as one vote, and still
 * steps aside once MULO has ratings of its own.
 */
const FROM_ARTIST = 0.6;
const TOWARDS_MIDDLE = 1 - FROM_ARTIST;
const MIDDLE = 6.5;

function fromArtist(artistSeed: number | null): number | null {
  if (artistSeed === null) return null;
  return (
    Math.round((artistSeed * FROM_ARTIST + MIDDLE * TOWARDS_MIDDLE) * 10) / 10
  );
}

type Seeded = { sum: number; count: number; seeded: boolean };

/** Everyone's ratings, plus the starting score while it still counts. */
function withSeed(scores: number[], seed: number | null): Seeded {
  const sum = scores.reduce((total, score) => total + score, 0);
  if (seed === null || scores.length >= SEED_RETIRES_AT) {
    return { sum, count: scores.length, seeded: false };
  }
  return { sum: sum + seed, count: scores.length + 1, seeded: true };
}

export type OwnRating = {
  score: number;
  review: string | null;
} | null;

export type Sort = "recent" | "highest" | "lowest";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The starting score an album or artist borrows while MULO has too few of its own. */
async function getSeed(
  kind: "album" | "artist",
  mbid: string,
): Promise<number | null> {
  const supabase = await createClient();
  // An album also carries its artist's score, to fall back on.
  const { data } = await supabase
    .from(SEED_TABLES[kind])
    .select(
      kind === "album" ? "seed_score, artists ( seed_score )" : "seed_score",
    )
    .eq("mbid", mbid)
    .maybeSingle();
  // The column only exists once migration 0014 has been run, so a missing one
  // reads as no seed and the page behaves exactly as it did before.
  const row = data as {
    seed_score: number | null;
    artists?: { seed_score: number | null } | null;
  } | null;
  return row?.seed_score ?? fromArtist(row?.artists?.seed_score ?? null);
}

/**
 * What everybody but one person gave something: the page's "Everyone" score
 * as it stood before they rated, starting score included. Hot takes are
 * measured against this, so one can fire on a quiet page where the only other
 * voice is the starting score.
 */
export async function getCrowd(
  kind: RatingKind,
  mbid: string,
  excludeUserId: string,
): Promise<{ average: number; count: number } | undefined> {
  const supabase = await createClient();
  const { table, column } = RATING_TABLES[kind];
  const [{ data }, seed] = await Promise.all([
    supabase
      .from(table)
      .select("score")
      .eq(column, mbid)
      .neq("user_id", excludeUserId)
      .limit(2000),
    kind === "song" ? Promise.resolve(null) : getSeed(kind, mbid),
  ]);
  const crowd = withSeed(
    (data ?? []).map((row) => row.score as number),
    seed,
  );
  return crowd.count
    ? { average: crowd.sum / crowd.count, count: crowd.count }
    : undefined;
}

/** The three scores shown at the top of an album or artist page. */
export async function getScores(
  kind: "album" | "artist",
  mbid: string,
): Promise<Scores> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { table, column } = RATING_TABLES[kind];

  const [{ data }, seed, followingIds] = await Promise.all([
    supabase.from(table).select("user_id, score").eq(column, mbid),
    getSeed(kind, mbid),
    user ? getFollowingIds(user.id) : Promise.resolve<string[]>([]),
  ]);

  const all = (data ?? []) as { user_id: string; score: number }[];
  const followed = new Set(followingIds);
  const friendScores = all
    .filter((r) => followed.has(r.user_id))
    .map((r) => r.score);

  const everyone = withSeed(
    all.map((r) => r.score),
    seed,
  );

  return {
    overall: everyone.count === 0 ? null : everyone.sum / everyone.count,
    overallCount: everyone.count,
    you: user ? (all.find((r) => r.user_id === user.id)?.score ?? null) : null,
    friends: average(friendScores),
    friendsCount: friendScores.length,
    seeded: everyone.seeded,
  };
}

/**
 * Overall scores for many releases in one query, for grids like the artist
 * page. Returns a map of release mbid to average, omitting unrated releases.
 */
export async function getScoresForReleases(
  releaseMbids: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (releaseMbids.length === 0) return result;

  const supabase = await createClient();

  const [{ data }, { data: seeds }] = await Promise.all([
    supabase.from("ratings").select("release_mbid, score").in("release_mbid", releaseMbids),
    supabase
      .from("releases")
      .select("mbid, seed_score, artists ( seed_score )")
      .in("mbid", releaseMbids),
  ]);

  const grouped = new Map<string, number[]>();
  for (const row of data ?? []) {
    const scores = grouped.get(row.release_mbid) ?? [];
    scores.push(row.score);
    grouped.set(row.release_mbid, scores);
  }

  // A shelf of dashes is the thing the starting score exists to prevent, so
  // grids blend it in the same way an album page does.
  const seed = new Map(
    (
      (seeds ?? []) as unknown as {
        mbid: string;
        seed_score: number | null;
        artists: { seed_score: number | null } | null;
      }[]
    ).map((row) => [
      row.mbid,
      row.seed_score ?? fromArtist(row.artists?.seed_score ?? null),
    ]),
  );

  for (const mbid of releaseMbids) {
    const everyone = withSeed(grouped.get(mbid) ?? [], seed.get(mbid) ?? null);
    if (everyone.count > 0) result.set(mbid, everyone.sum / everyone.count);
  }

  return result;
}

export async function getOwnRating(
  kind: "album" | "artist",
  mbid: string,
): Promise<OwnRating> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { table, column } = RATING_TABLES[kind];

  const { data } = await supabase
    .from(table)
    .select("score, review")
    .eq(column, mbid)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

export type SongScores = {
  /** Everyone's average for each rated song. */
  community: Record<string, { average: number; count: number }>;
  /** The signed-in person's own score for each song they've rated. */
  own: Record<string, number>;
};

/** Scores for every song in a tracklist, from one query. */
export async function getSongScores(songMbids: string[]): Promise<SongScores> {
  const result: SongScores = { community: {}, own: {} };
  if (songMbids.length === 0) return result;

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data } = await supabase
    .from("song_ratings")
    .select("user_id, song_mbid, score")
    .in("song_mbid", songMbids);

  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of (data ?? []) as {
    user_id: string;
    song_mbid: string;
    score: number;
  }[]) {
    const total = totals.get(row.song_mbid) ?? { sum: 0, count: 0 };
    total.sum += row.score;
    total.count += 1;
    totals.set(row.song_mbid, total);
    if (user && row.user_id === user.id) result.own[row.song_mbid] = row.score;
  }

  for (const [mbid, total] of totals) {
    result.community[mbid] = { average: total.sum / total.count, count: total.count };
  }

  return result;
}

export type TopSong = {
  mbid: string;
  title: string;
  average: number;
  count: number;
  release: { mbid: string; title: string; cover_art_url: string | null };
};

/**
 * An artist's best-rated songs, from ratings on their albums. Averaging in
 * code is fine at soft-launch scale, like the Discover page's top albums.
 */
export async function getTopSongs(artistMbid: string, limit = 5): Promise<TopSong[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("song_ratings")
    .select(
      "song_mbid, score, songs!inner ( title ), releases!inner ( mbid, title, cover_art_url, artist_mbid )",
    )
    .eq("releases.artist_mbid", artistMbid)
    .limit(5000);

  type Row = {
    song_mbid: string;
    score: number;
    songs: { title: string };
    releases: { mbid: string; title: string; cover_art_url: string | null };
  };

  const songs = new Map<string, TopSong & { sum: number }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const song = songs.get(row.song_mbid) ?? {
      mbid: row.song_mbid,
      title: row.songs.title,
      average: 0,
      count: 0,
      sum: 0,
      release: {
        mbid: row.releases.mbid,
        title: row.releases.title,
        cover_art_url: row.releases.cover_art_url,
      },
    };
    song.sum += row.score;
    song.count += 1;
    songs.set(row.song_mbid, song);
  }

  return [...songs.values()]
    .map(({ sum, ...song }) => ({ ...song, average: sum / song.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, limit);
}

type ArtistRef = { mbid: string; name: string };

export type AlbumRating = {
  score: number;
  review: string | null;
  created_at: string;
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    release_date: string | null;
    /** MusicBrainz genre tags, for filtering somebody's ratings by genre. */
    genres?: string[];
    artist: ArtistRef | null;
  };
};

export type ArtistRating = {
  score: number;
  review: string | null;
  created_at: string;
  artist: { mbid: string; name: string; image_url: string | null };
};

export type SongRating = {
  score: number;
  created_at: string;
  song: { mbid: string; title: string };
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    artist: ArtistRef | null;
  };
};

/** Highest or lowest first, newest first among equal scores. */
function sortOrder(sort: Sort) {
  return sort === "recent"
    ? [{ column: "created_at", ascending: false }]
    : [
        { column: "score", ascending: sort === "lowest" },
        { column: "created_at", ascending: false },
      ];
}

/** Everything the signed-in user has rated, one kind at a time, for "My ratings". */
export async function getOwnAlbumRatings(sort: Sort = "recent"): Promise<AlbumRating[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const query = supabase
    .from("ratings")
    .select(
      `score, review, created_at,
       releases!inner ( mbid, title, cover_art_url, release_date, genres, artists ( mbid, name ) )`,
    )
    .eq("user_id", user.id);
  for (const { column, ascending } of sortOrder(sort)) query.order(column, { ascending });

  const { data } = await query;

  type Row = Omit<AlbumRating, "release"> & {
    releases: Omit<AlbumRating["release"], "artist"> & { artists: ArtistRef | null };
  };

  return ((data ?? []) as unknown as Row[]).map(({ releases, ...row }) => ({
    ...row,
    release: {
      mbid: releases.mbid,
      title: releases.title,
      cover_art_url: releases.cover_art_url,
      release_date: releases.release_date,
      genres: releases.genres ?? [],
      artist: releases.artists,
    },
  }));
}

export async function getOwnArtistRatings(sort: Sort = "recent"): Promise<ArtistRating[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const query = supabase
    .from("artist_ratings")
    .select("score, review, created_at, artists!inner ( mbid, name, image_url )")
    .eq("user_id", user.id);
  for (const { column, ascending } of sortOrder(sort)) query.order(column, { ascending });

  const { data } = await query;

  type Row = Omit<ArtistRating, "artist"> & { artists: ArtistRating["artist"] };

  return ((data ?? []) as unknown as Row[]).map(({ artists, ...row }) => ({
    ...row,
    artist: artists,
  }));
}

export async function getOwnSongRatings(sort: Sort = "recent"): Promise<SongRating[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const query = supabase
    .from("song_ratings")
    .select(
      `score, created_at, songs!inner ( mbid, title ),
       releases!inner ( mbid, title, cover_art_url, artists ( mbid, name ) )`,
    )
    .eq("user_id", user.id)
    .limit(1000);
  for (const { column, ascending } of sortOrder(sort)) query.order(column, { ascending });

  const { data } = await query;

  type Row = {
    score: number;
    created_at: string;
    songs: SongRating["song"];
    releases: Omit<SongRating["release"], "artist"> & { artists: ArtistRef | null };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    score: row.score,
    created_at: row.created_at,
    song: row.songs,
    release: {
      mbid: row.releases.mbid,
      title: row.releases.title,
      cover_art_url: row.releases.cover_art_url,
      artist: row.releases.artists,
    },
  }));
}

/** How many of each kind the signed-in user has rated, for the tab labels. */
export async function getOwnRatingCounts(): Promise<Record<RatingKind, number>> {
  const counts: Record<RatingKind, number> = { album: 0, artist: 0, song: 0 };
  const user = await getCurrentUser();
  if (!user) return counts;

  const supabase = await createClient();
  const kinds = Object.keys(RATING_TABLES) as RatingKind[];

  const results = await Promise.all(
    kinds.map((kind) =>
      supabase
        .from(RATING_TABLES[kind].table)
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
    ),
  );

  kinds.forEach((kind, i) => {
    counts[kind] = results[i].count ?? 0;
  });
  return counts;
}

/**
 * Somebody's best-scored albums, for the shelf at the top of their profile.
 * A wall of covers says more about someone's taste than a list of dates.
 */
export async function getHighestRatedAlbums(
  userId: string,
  limit = 12,
): Promise<AlbumRating[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ratings")
    .select(
      `score, review, created_at,
       releases!inner ( mbid, title, cover_art_url, release_date, artists ( mbid, name ) )`,
    )
    .eq("user_id", userId)
    .gte("score", 8)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = Omit<AlbumRating, "release"> & {
    releases: Omit<AlbumRating["release"], "artist"> & { artists: ArtistRef | null };
  };

  return ((data ?? []) as unknown as Row[]).map(({ releases, ...row }) => ({
    ...row,
    release: {
      mbid: releases.mbid,
      title: releases.title,
      cover_art_url: releases.cover_art_url,
      release_date: releases.release_date,
      artist: releases.artists,
    },
  }));
}

/**
 * The signed-in person's own scores for a set of albums, so a grid can mark
 * what they've already rated. Empty when nobody is signed in.
 */
export async function getMyAlbumScores(mbids: string[]): Promise<Map<string, number>> {
  const user = await getCurrentUser();
  if (!user || mbids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ratings")
    .select("release_mbid, score")
    .eq("user_id", user.id)
    .in("release_mbid", mbids.slice(0, 500));
  return new Map(
    ((data ?? []) as { release_mbid: string; score: number }[]).map((r) => [r.release_mbid, r.score]),
  );
}
