import "server-only";
import {
  getReleaseGroupBrief,
  MbNotFoundError,
  MbResponseError,
  type MbReleaseGroup,
} from "@/lib/musicbrainz";
import { confirmGroup, type Confirmed, type Pending } from "@/lib/releases/confirm";
import {
  newCandidates,
  readFreshReleases,
  type Candidate,
  type FreshRelease,
} from "@/lib/releases/fresh";
import * as store from "@/lib/releases/store";

export type ReleasesTickDeps = {
  claimRead: (day: string) => Promise<boolean>;
  markRead: (day: string) => Promise<void>;
  readFresh: (day: string) => Promise<FreshRelease[]>;
  followedAmong: (artists: string[]) => Promise<Set<string>>;
  listedDates: (groups: string[]) => Promise<Map<string, string>>;
  queue: (candidates: Candidate[]) => Promise<void>;
  pending: (limit: number) => Promise<Pending[]>;
  /** MusicBrainz's album, or null when it has none by that id. */
  lookUp: (group: string) => Promise<MbReleaseGroup | null>;
  saveConfirmed: (group: string, confirmed: Confirmed) => Promise<void>;
  refuse: (group: string) => Promise<void>;
  /** A failed try, `tries` being the count to keep. */
  fail: (group: string, tries: number) => Promise<void>;
};

async function lookUp(group: string): Promise<MbReleaseGroup | null> {
  try {
    return await getReleaseGroupBrief(group);
  } catch (error) {
    if (error instanceof MbNotFoundError) return null;
    throw error;
  }
}

const real = (): ReleasesTickDeps => ({
  claimRead: store.claimRead,
  markRead: (day) => store.markRead(day),
  readFresh: (day) => readFreshReleases(day),
  followedAmong: store.followedAmong,
  listedDates: store.listedDates,
  queue: store.queueReleases,
  pending: store.pendingReleases,
  lookUp,
  saveConfirmed: (group, confirmed) => store.saveConfirmed(group, confirmed),
  refuse: (group) => store.refuseRelease(group),
  fail: (group, tries) => store.failRelease(group, tries),
});

export type ReleasesTickReport = {
  /** Whether this run read the day's fresh releases. */
  read: boolean;
  queued: number;
  confirmed: number;
  refused: number;
  errors: number;
};

/** The most confirmations a run takes on; at one a second a run fits about eight. */
const PENDING_LIMIT = 20;

const reason = (error: unknown) => (error instanceof Error ? error.message : error);

/** The day's read: fresh releases by followed artists, filed to confirm. Answers how many. */
async function readDay(day: string, deps: ReleasesTickDeps): Promise<number> {
  const fresh = await deps.readFresh(day);
  const followed = await deps.followedAmong([...new Set(fresh.flatMap((r) => r.artists))]);
  const theirs = fresh.filter((r) => r.artists.some((id) => followed.has(id)));
  const known = await deps.listedDates(theirs.map((r) => r.group));
  const candidates = newCandidates(theirs, followed, known, day);
  await deps.queue(candidates);
  await deps.markRead(day);
  return candidates.length;
}

/** Failures in a row that look like MusicBrainz being down before a run stops. */
const DOWN_IN_A_ROW = 2;

/** A timeout, MusicBrainz's 5xx, or its rate limit outlasting the retries. */
function looksDown(error: unknown): boolean {
  if (error instanceof MbResponseError) return error.status >= 500 || error.status === 429;
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Confirms or refuses one waiting release. */
async function confirmOne(
  pending: Pending,
  day: string,
  deps: ReleasesTickDeps,
  report: ReleasesTickReport,
): Promise<void> {
  const group = await deps.lookUp(pending.group);
  const confirmed = group ? confirmGroup(group, pending, day) : null;
  if (confirmed) {
    await deps.saveConfirmed(pending.group, confirmed);
    report.confirmed += 1;
  } else {
    await deps.refuse(pending.group);
    report.refused += 1;
  }
}

/**
 * Confirms waiting releases with MusicBrainz, one a second, none started
 * after `deadline`. A release that fails is noted and the rest carry on: a
 * try is counted on it, and the third refuses it (store.MAX_TRIES). A
 * failure that looks like MusicBrainz being down isn't the release's fault
 * and counts no try, and two of those in a row stop the run: what's left
 * waits for the next.
 */
async function confirmWaiting(
  day: string,
  deadline: number,
  deps: ReleasesTickDeps,
  report: ReleasesTickReport,
): Promise<void> {
  if (Date.now() >= deadline) return;
  let downInARow = 0;
  for (const pending of await deps.pending(PENDING_LIMIT)) {
    if (Date.now() >= deadline) return;
    try {
      await confirmOne(pending, day, deps, report);
      downInARow = 0;
    } catch (error) {
      report.errors += 1;
      const down = looksDown(error);
      console.error(`[releases] confirming ${pending.group} failed:`, reason(error));
      try {
        await deps.fail(pending.group, down ? pending.tries : pending.tries + 1);
      } catch (noted) {
        console.error("[releases] noting a failed try failed:", reason(noted));
      }
      downInARow = down ? downInARow + 1 : 0;
      if (downInARow >= DOWN_IN_A_ROW) return;
    }
  }
}

/**
 * The clock's releases job (push/tick, every 15 minutes): once a UTC day,
 * ListenBrainz's fresh releases, tried again on the next run when it fails,
 * up to four times; then confirmations with MusicBrainz for as long as the
 * deadline allows. A failure in one is logged and counted, and the other
 * still runs.
 */
export async function runReleasesTick(
  at = new Date(),
  deadline = Date.now() + 8_000,
  deps: ReleasesTickDeps = real(),
): Promise<ReleasesTickReport> {
  const report: ReleasesTickReport = {
    read: false,
    queued: 0,
    confirmed: 0,
    refused: 0,
    errors: 0,
  };
  const day = at.toISOString().slice(0, 10);
  try {
    if (Date.now() < deadline && (await deps.claimRead(day))) {
      report.queued = await readDay(day, deps);
      report.read = true;
    }
  } catch (error) {
    report.errors += 1;
    console.error("[releases] the day's read failed:", reason(error));
  }
  try {
    await confirmWaiting(day, deadline, deps, report);
  } catch (error) {
    report.errors += 1;
    console.error("[releases] confirming failed:", reason(error));
  }
  return report;
}
