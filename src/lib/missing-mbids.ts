/**
 * Ids MusicBrainz said it doesn't have, remembered for a while on this server,
 * so somebody trying made-up ids can't spend MULO's MusicBrainz allowance, of
 * one request a second, on asking again. Only memory, so each server learns for
 * itself; that's enough to take the repeat off the queue.
 */

export const MISSING_FOR_MS = 10 * 60 * 1000;

/** Ten thousand made-up ids would otherwise be ten thousand entries. */
const MOST = 2000;

/** Oldest first, as a Map keeps the order things went in. */
const missing = new Map<string, number>();

/** MusicBrainz answered that it doesn't have this one. */
export function noteMissing(mbid: string, now = Date.now()): void {
  missing.delete(mbid);
  missing.set(mbid, now + MISSING_FOR_MS);
  if (missing.size > MOST) {
    const oldest = missing.keys().next().value;
    if (oldest !== undefined) missing.delete(oldest);
  }
}

/** Whether MusicBrainz said so lately. */
export function isMissing(mbid: string, now = Date.now()): boolean {
  const until = missing.get(mbid);
  if (until === undefined) return false;
  if (now < until) return true;
  missing.delete(mbid);
  return false;
}

/** For tests: nothing remembered. */
export function forgetMissing(): void {
  missing.clear();
}
