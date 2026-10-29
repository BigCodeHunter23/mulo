import "server-only";
import * as store from "@/lib/push/store";
import { sendPushes } from "@/lib/push/send";
import {
  followMessage,
  loveMessage,
  mentionMessage,
  replyMessage,
  type PushMessage,
} from "@/lib/push/messages";
import { dayKey, hourKey } from "@/lib/push/who";
import type { ReactionKind } from "@/lib/reactions";
import { parseMentions, type ThreadKind } from "@/lib/replies-shared";

export type EventDeps = {
  personOf: typeof store.personOf;
  peoplePushesSince: typeof store.peoplePushesSince;
  blockedEitherWay: typeof store.blockedEitherWay;
  loveTarget: typeof store.loveTarget;
  replyTarget: typeof store.replyTarget;
  peopleNamed: typeof store.peopleNamed;
  picksIn: typeof store.picksIn;
  send: (messages: Parameters<typeof sendPushes>[0]) => Promise<number>;
};

const real = (): EventDeps => ({
  personOf: store.personOf,
  peoplePushesSince: store.peoplePushesSince,
  blockedEitherWay: store.blockedEitherWay,
  loveTarget: store.loveTarget,
  replyTarget: store.replyTarget,
  peopleNamed: store.peopleNamed,
  picksIn: store.picksIn,
  send: (messages) => sendPushes(messages),
});

/**
 * Follow, love and reply pushes one person gets in an hour, at most. Past it they
 * still see every one in the bell; their phone just stops buzzing.
 */
export const PEOPLE_PUSHES_PER_HOUR = 10;

/** Whether somebody has had their hour's worth of people pushes. */
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

/** A reply just saved, as `notifyReply` needs it. */
export type ReplyEvent = {
  kind: ThreadKind;
  targetId: number;
  replierId: string;
  body: string;
};

/**
 * "Jo replied to your review of Blonde" for the author, and "Jo mentioned you
 * on Sam's review of Blonde" for each of the first five people named, at
 * most once an hour per thread for each of them. Never for your own reply,
 * never across a block (with the replier, or for somebody named, with the
 * thread's owner too), and inside the cap of ten people pushes an hour. An
 * author who's named gets the author's push only. Earlier repliers hear
 * about it in the bell only. On a take whose matchup is still open, only
 * people who've picked are told: nobody else can read the thread yet.
 */
export async function notifyReply(
  event: ReplyEvent,
  at = new Date(),
  deps: EventDeps = real(),
): Promise<void> {
  try {
    const target = await deps.replyTarget(event.kind, event.targetId);
    if (!target) return;
    const replier = await deps.personOf(event.replierId);
    if (!replier) return;

    const key = hourKey(`${event.kind}-${event.targetId}`, at);
    const messages: PushMessage[] = [];

    if (
      target.ownerId !== event.replierId &&
      !(await deps.blockedEitherWay(target.ownerId, event.replierId)) &&
      !(await overCap(target.ownerId, at, deps))
    ) {
      messages.push({
        userId: target.ownerId,
        kind: "reply",
        key,
        ...replyMessage(replier, target.subject, event.body),
      });
    }

    const names = parseMentions(event.body);
    let named = names.length > 0 ? await deps.peopleNamed(names) : [];
    named = named.filter((person) => person.id !== event.replierId && person.id !== target.ownerId);
    // A take on today's Versus can only be read by people who've picked.
    if (target.openMatchup !== null && named.length > 0) {
      const picked = await deps.picksIn(
        target.openMatchup,
        named.map((person) => person.id),
      );
      named = named.filter((person) => picked.has(person.id));
    }

    for (const person of named) {
      if (await deps.blockedEitherWay(person.id, event.replierId)) continue;
      if (await deps.blockedEitherWay(person.id, target.ownerId)) continue;
      if (await overCap(person.id, at, deps)) continue;
      messages.push({
        userId: person.id,
        kind: "reply",
        key,
        ...mentionMessage(replier, target.owner, target.subject, event.body),
      });
    }

    if (messages.length > 0) await deps.send(messages);
  } catch (error) {
    console.error("[push] reply push failed:", error);
  }
}
