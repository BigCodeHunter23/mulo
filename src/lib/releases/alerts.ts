import { releaseMessage, type PushMessage } from "@/lib/push/messages";
import type { DayRelease } from "@/lib/releases/store";

/** Somebody due their release push, and their own day. */
export type DueRelease = { userId: string; day: string };

/**
 * Each person's release push for their day: the releases out that day by
 * artists they follow now (so unfollowing first means no push), as one push
 * however many there are. Keyed by their day in the log, so it goes once.
 */
export function releaseAlerts(
  due: DueRelease[],
  releases: DayRelease[],
  followers: Map<string, Set<string>>,
): PushMessage[] {
  return due.flatMap(({ userId, day }): PushMessage[] => {
    const theirs = releases.filter(
      (release) => release.day === day && followers.get(release.artistMbid)?.has(userId),
    );
    return theirs.length > 0
      ? [{ userId, kind: "release", key: day, ...releaseMessage(theirs) }]
      : [];
  });
}
