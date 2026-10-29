import "server-only";
import { advanceLastfm, type LastfmReport } from "@/lib/diary/lastfm-jobs";
import { runMatcher, type MatchReport } from "@/lib/diary/match";
import { createAdminClient } from "@/lib/supabase/admin";

export type DiaryTickDeps = {
  match: (at: Date, deadline: number) => Promise<MatchReport>;
  /**
   * Gives entries the albums their names were matched to after they were
   * saved, and files again any name an unmatched entry lost.
   */
  sweep: () => Promise<number>;
  lastfm: (at: Date, deadline: number) => Promise<LastfmReport>;
};

const real = (): DiaryTickDeps => ({
  match: (at, deadline) => runMatcher(at, deadline),
  sweep: async () => {
    const { data, error } = await createAdminClient().rpc("diary_sweep");
    if (error) throw error;
    return data ?? 0;
  },
  lastfm: (at, deadline) => advanceLastfm(at, deadline),
});

export type DiaryTickReport = {
  matched: number;
  missed: number;
  swept: number;
  lastfmPeople: number;
  errors: number;
};

/** The most matching gets of a run, so Last.fm always has a turn. */
const MATCH_SHARE_MS = 15_000;
/**
 * How long one MusicBrainz search can take, retry and queue included.
 * Matching stops starting them this long before the diary's deadline.
 */
const SLOWEST_SEARCH_MS = 15_000;

const reason = (error: unknown) => (error instanceof Error ? error.message : error);

/**
 * The diary's share of each run of the clock, after the pushes: matching
 * names to albums, a sweep for entries saved just as their name was matched
 * or forgotten (migration 0025's `diary_sweep`), then Last.fm imports and
 * syncs. A failure in one is logged and counted, and the others still run.
 */
export async function runDiaryTick(
  at = new Date(),
  deadline = Date.now() + 15_000,
  deps: DiaryTickDeps = real(),
): Promise<DiaryTickReport> {
  const report: DiaryTickReport = {
    matched: 0,
    missed: 0,
    swept: 0,
    lastfmPeople: 0,
    errors: 0,
  };
  try {
    const matched = await deps.match(
      at,
      Math.min(deadline - SLOWEST_SEARCH_MS, Date.now() + MATCH_SHARE_MS),
    );
    report.matched = matched.matched;
    report.missed = matched.missed;
    report.errors += matched.errors;
  } catch (error) {
    report.errors += 1;
    console.error("[diary] matching failed:", reason(error));
  }
  try {
    report.swept = await deps.sweep();
  } catch (error) {
    report.errors += 1;
    console.error("[diary] the sweep failed:", reason(error));
  }
  try {
    const lastfm = await deps.lastfm(at, deadline);
    report.lastfmPeople = lastfm.people;
    report.errors += lastfm.errors;
  } catch (error) {
    report.errors += 1;
    console.error("[diary] Last.fm failed:", reason(error));
  }
  return report;
}
