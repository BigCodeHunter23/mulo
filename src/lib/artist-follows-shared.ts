/**
 * The plain rules of following artists, for pages and client components
 * alike; `artist-follows.ts` does the reading.
 */

/** What somebody following as many as the database allows (2,000, migration 0026) is told. */
export const ARTISTS_FULL = "You follow as many artists as MULO allows.";

/** The suggestions card's most artists, and the most followed in one go. */
export const SUGGESTIONS_MAX = 12;

/** An artist page counts followers from three: "2 followers" says nothing. */
export const FOLLOWERS_SHOWN_FROM = 3;

/** "1,204 followers" under an artist's name, or null below three. */
export function followersLine(count: number): string | null {
  return count >= FOLLOWERS_SHOWN_FROM ? `${count.toLocaleString("en")} followers` : null;
}
