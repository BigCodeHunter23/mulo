import "server-only";
import { getReleaseGroupBrief, MbNotFoundError, type MbReleaseGroup } from "@/lib/musicbrainz";
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

/**
 * Confirms waiting releases with MusicBrainz, one a second, none started
 * after `deadline`. A failed lookup stops the run: MusicBrainz is
 * struggling, and what's left waits for the next.
 */
async function confirmWaiting(
  day: string,
  deadline: number,
  deps: ReleasesTickDeps,
  report: ReleasesTickReport,
): Promise<void> {
  if (Date.now() >= deadline) return;
  for (const pending of await deps.pending(PENDING_LIMIT)) {
    if (Date.now() >= deadline) return;
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
