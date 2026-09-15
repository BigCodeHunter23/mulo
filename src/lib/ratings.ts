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
};

export type OwnRating = {
  score: number;
  review: string | null;
} | null;

export type Sort = "recent" | "highest" | "lowest";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The three scores shown at the top of an album or artist page. */
export async function getScores(
  kind: "album" | "artist",
  mbid: string,
): Promise<Scores> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { table, column } = RATING_TABLES[kind];

  const [{ data }, followingIds] = await Promise.all([
    supabase.from(table).select("user_id, score").eq(column, mbid),
    user ? getFollowingIds(user.id) : Promise.resolve<string[]>([]),
  ]);

  const all = (data ?? []) as { user_id: string; score: number }[];
  const followed = new Set(followingIds);
  const friendScores = all
    .filter((r) => followed.has(r.user_id))
    .map((r) => r.score);

  return {
    overall: average(all.map((r) => r.score)),
    overallCount: all.length,
    you: user ? (all.find((r) => r.user_id === user.id)?.score ?? null) : null,
    friends: average(friendScores),
    friendsCount: friendScores.length,
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

  const { data } = await supabase
    .from("ratings")
    .select("release_mbid, score")
    .in("release_mbid", releaseMbids);

  const grouped = new Map<string, number[]>();
  for (const row of data ?? []) {
    const scores = grouped.get(row.release_mbid) ?? [];
    scores.push(row.score);
    grouped.set(row.release_mbid, scores);
  }

  for (const [mbid, scores] of grouped) {
    const mean = average(scores);
    if (mean !== null) result.set(mbid, mean);
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
       releases!inner ( mbid, title, cover_art_url, release_date, artists ( mbid, name ) )`,
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
