import "server-only";

/**
 * Last.fm. Keys come from LASTFM_API_KEY and LASTFM_API_SECRET; without them,
 * Connect Last.fm isn't offered.
 */
export function lastfmKeys(): { key: string; secret: string } | null {
  const key = process.env.LASTFM_API_KEY;
  const secret = process.env.LASTFM_API_SECRET;
  return key && secret ? { key, secret } : null;
}
