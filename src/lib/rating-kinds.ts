/** The three things people rate on MULO. */
export type RatingKind = "album" | "artist" | "song";

export type RatingTable = "ratings" | "artist_ratings" | "song_ratings";

/**
 * Where each kind's ratings live, and the column naming what was rated.
 *
 * The column is plain text rather than its literal name on purpose: the typed
 * query builder can't follow a column that changes with the kind, and plain
 * text is what it accepts for one. The tables themselves share every other
 * column, so reads of those stay fully typed.
 */
export const RATING_TABLES: Record<RatingKind, { table: RatingTable; column: string }> = {
  album: { table: "ratings", column: "release_mbid" },
  artist: { table: "artist_ratings", column: "artist_mbid" },
  song: { table: "song_ratings", column: "song_mbid" },
};

/**
 * The table for an album or artist rating, typed as the album one. The two
 * have the same columns apart from the one naming what was rated, which
 * callers reach through `RATING_TABLES`' plain-text column; the typed query
 * builder can't follow a table chosen at runtime.
 */
export function reviewedTable(kind: "album" | "artist"): "ratings" {
  return RATING_TABLES[kind].table as "ratings";
}
