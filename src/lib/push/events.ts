import "server-only";
import * as store from "@/lib/push/store";
import { sendPushes } from "@/lib/push/send";
import { followMessage, loveMessage } from "@/lib/push/messages";
import { dayKey, hourKey } from "@/lib/push/who";
import type { ReactionKind } from "@/lib/reactions";

export type EventDeps = {
  personOf: typeof store.personOf;
  blockedEitherWay: typeof store.blockedEitherWay;
  loveTarget: typeof store.loveTarget;
  send: (messages: Parameters<typeof sendPushes>[0]) => Promise<number>;
};

const real = (): EventDeps => ({
  personOf: store.personOf,
  blockedEitherWay: store.blockedEitherWay,
  loveTarget: store.loveTarget,
  send: (messages) => sendPushes(messages),
});

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
