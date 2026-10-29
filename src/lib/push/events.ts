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
  followsEitherWay: typeof store.followsEitherWay;
  repliedIn: typeof store.repliedIn;
  saveMentions: typeof store.saveMentions;
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
  followsEitherWay: store.followsEitherWay,
  repliedIn: store.repliedIn,
  saveMentions: store.saveMentions,
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

/** Somebody named in a reply who may hear about it. */
export type Named = { id: string; username: string; display_name: string | null };

/**
 * Of the first five @names in a reply, the people who may hear they were
 * named: real people other than the replier and the thread's owner (who
 * hears as its owner), with a connection to the reply (they follow the
 * replier, the replier follows them, or they've replied in the thread
 * before), nobody blocked either way with either of them, and on a take
 * whose matchup is still open, only people who've picked, since nobody else
 * can read the thread yet. A stranger's @name is still a link to their
 * profile; it just tells them nothing. Pushes and the bell both go by this.
 */
export async function resolveMentions(
  event: Pick<ReplyEvent, "kind" | "targetId" | "replierId" | "body">,
  target: Pick<store.ReplyTarget, "ownerId" | "openMatchup">,
  deps: Pick<
    EventDeps,
    "peopleNamed" | "picksIn" | "blockedEitherWay" | "followsEitherWay" | "repliedIn"
  >,
): Promise<Named[]> {
  const names = parseMentions(event.body);
  if (names.length === 0) return [];
  let named = (await deps.peopleNamed(names)).filter(
    (person) => person.id !== event.replierId && person.id !== target.ownerId,
  );
  named = await connected(event, named, deps);
  if (target.openMatchup !== null && named.length > 0) {
    const picked = await deps.picksIn(
      target.openMatchup,
      named.map((person) => person.id),
    );
    named = named.filter((person) => picked.has(person.id));
  }
  const blocked = await Promise.all(
    named.map(
      async (person) =>
        (await deps.blockedEitherWay(person.id, event.replierId)) ||
        (await deps.blockedEitherWay(person.id, target.ownerId)),
    ),
  );
  return named.filter((_, i) => !blocked[i]);
}

/**
 * Of the people named, those with a connection: a follow either way with the
 * replier, or a reply of their own in the thread. The thread is only asked
 * about for the people the follows didn't settle.
 */
async function connected(
  event: Pick<ReplyEvent, "kind" | "targetId" | "replierId">,
  named: Named[],
  deps: Pick<EventDeps, "followsEitherWay" | "repliedIn">,
): Promise<Named[]> {
  if (named.length === 0) return [];
  const follows = await deps.followsEitherWay(
    event.replierId,
    named.map((person) => person.id),
  );
  const rest = named.filter((person) => !follows.has(person.id));
  const replied =
    rest.length > 0
      ? await deps.repliedIn(
          event.kind,
          event.targetId,
          rest.map((person) => person.id),
        )
      : new Set<string>();
  return named.filter((person) => follows.has(person.id) || replied.has(person.id));
}

/**
 * Keeps who a just-posted reply names, for their bells (migration 0024), by
 * the same rule as the pushes. Never throws: the reply is saved either way,
 * and a failure here only costs the bell its mention lines.
 */
export async function recordMentions(
  replyId: number,
  event: ReplyEvent,
  deps: EventDeps = real(),
): Promise<void> {
  if (parseMentions(event.body).length === 0) return;
  try {
    const target = await deps.replyTarget(event.kind, event.targetId);
    if (!target) return;
    const named = await resolveMentions(event, target, deps);
    if (named.length > 0) {
      await deps.saveMentions(
        replyId,
        named.map((person) => person.id),
      );
    }
  } catch (error) {
    console.error("[replies] couldn't keep who a reply names:", error);
  }
}

/**
 * "Jo replied to your review of Blonde" for the author, and "Jo mentioned you
 * on Sam's review of Blonde" for each of the first five people named who
 * have a connection to it (`resolveMentions`), at most once an hour per
 * thread for each of them. Never for your own reply, never across a block
 * (with the replier, or for somebody named, with the thread's owner too),
 * and not to anyone who's had ten follow, love and reply pushes in the past
 * hour. An author who's named gets the author's push only. Earlier repliers
 * hear about it in the bell only, unless they're named. On a take whose
 * matchup is still open, only people who've picked are told: nobody else
 * can read the thread yet.
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

    for (const person of await resolveMentions(event, target, deps)) {
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
