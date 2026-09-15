/** The three things people rate on MULO. */
export type RatingKind = "album" | "artist" | "song";

/** Where each kind's ratings live, and the column naming what was rated. */
export const RATING_TABLES = {
  album: { table: "ratings", column: "release_mbid" },
  artist: { table: "artist_ratings", column: "artist_mbid" },
  song: { table: "song_ratings", column: "song_mbid" },
} as const satisfies Record<RatingKind, { table: string; column: string }>;
