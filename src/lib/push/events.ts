import "server-only";
import * as store from "@/lib/push/store";
import { sendPushes } from "@/lib/push/send";
import { followMessage, loveMessage } from "@/lib/push/messages";
import { dayKey, hourKey } from "@/lib/push/who";
import type { ReactionKind } from "@/lib/reactions";

export type EventDeps = {
  personOf: typeof store.personOf;
  peoplePushesSince: typeof store.peoplePushesSince;
  blockedEitherWay: typeof store.blockedEitherWay;
  loveTarget: typeof store.loveTarget;
  send: (messages: Parameters<typeof sendPushes>[0]) => Promise<number>;
};

const real = (): EventDeps => ({
  personOf: store.personOf,
  peoplePushesSince: store.peoplePushesSince,
  blockedEitherWay: store.blockedEitherWay,
  loveTarget: store.loveTarget,
  send: (messages) => sendPushes(messages),
});

/**
 * Follow and love pushes one person gets in an hour, at most. Past it they
 * still see every one in the bell; their phone just stops buzzing.
 */
export const PEOPLE_PUSHES_PER_HOUR = 10;

/** Whether somebody has had their hour's worth of follow and love pushes. */
async function overCap(userId: string, at: Date, deps: EventDeps): Promise<boolean> {
  const since = new Date(at.getTime() - 3_600_000);
  return (await deps.peoplePushesSince(userId, since)) >= PEOPLE_PUSHES_PER_HOUR;
}

/** "Sam followed you", at most once a day for the same follower. */
export async function notifyFollow(
  followerId: string,
  targetId: string,
  at = new Date(),
  deps: EventDeps = real(),
): Promise<void> {
  try {
    if (await deps.blockedEitherWay(targetId, followerId)) return;
    const follower = await deps.personOf(followerId);
    if (!follower) return;
    if (await overCap(targetId, at, deps)) return;
    await deps.send([
      { userId: targetId, kind: "follow", key: dayKey(followerId, at), ...followMessage(follower) },
    ]);
  } catch (error) {
    console.error("[push] follow push failed:", error);
  }
}

/**
 * "Sam loved your review of Blonde", at most once an hour per rating or take.
 * Nahs never push, and nor do loves on a Versus pick: both stay in the bell.
 */
export async function notifyLove(
  kind: ReactionKind,
  ratingId: number,
  loverId: string,
  at = new Date(),
  deps: EventDeps = real(),
): Promise<void> {
  if (kind === "pick") return;
  try {
    const target = await deps.loveTarget(kind, ratingId);
    if (!target || target.ownerId === loverId) return;
    if (await deps.blockedEitherWay(target.ownerId, loverId)) return;
    const lover = await deps.personOf(loverId);
    if (!lover) return;
    if (await overCap(target.ownerId, at, deps)) return;
    await deps.send([
      {
        userId: target.ownerId,
        kind: "love",
        key: hourKey(`${kind}-${ratingId}`, at),
        ...loveMessage(lover, target.subject),
      },
    ]);
  } catch (error) {
    console.error("[push] love push failed:", error);
  }
}
