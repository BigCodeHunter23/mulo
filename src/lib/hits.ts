import "server-only";

/**
 * How many times each song has been played, from ListenBrainz, so an album can
 * lead with its hits rather than whatever happens to be track one.
 *
 * "Intro", "Ghettomusick", "Unhappy" is what the first three songs of
 * Speakerboxxx / The Love Below tell you, which is almost nothing. "Hey Ya!"
 * and "Roses" tell you everything. Play counts are the plainest honest way to
 * find the songs people actually know an album by.
 *
 * One request covers a whole Stack run. Counts change slowly, so they're kept
 * in memory for a day; a busy or unreachable ListenBrainz just means the card
 * falls back to tracklist order, never that the Stack fails to load.
 */

const ENDPOINT = "https://api.listenbrainz.org/1/popularity/recording";
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";

/** Somebody is waiting on the Stack; a slow answer is worth less than none. */
const TIMEOUT_MS = 2500;
const DAY_MS = 86_400_000;
/** ListenBrainz takes a long list in one go, but not an endless one. */
const BATCH = 1000;

const cache = new Map<string, { plays: number; at: number }>();

/** Play counts for the given songs, by MusicBrainz recording id. */
export async function playCounts(songMbids: string[]): Promise<Map<string, number>> {
  const now = Date.now();
  const counts = new Map<string, number>();
  const missing: string[] = [];

  for (const mbid of new Set(songMbids)) {
    const hit = cache.get(mbid);
    if (hit && now - hit.at < DAY_MS) counts.set(mbid, hit.plays);
    else missing.push(mbid);
  }

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ recording_mbids: batch }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) break;

      const rows = (await response.json()) as {
        recording_mbid: string;
        total_listen_count: number | null;
      }[];
      for (const row of rows) {
        const plays = row.total_listen_count ?? 0;
        counts.set(row.recording_mbid, plays);
        cache.set(row.recording_mbid, { plays, at: now });
      }
    } catch {
      // Slow or down: carry on with what we have.
      break;
    }
  }

  return counts;
}
