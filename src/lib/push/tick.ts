import "server-only";
import * as store from "@/lib/push/store";
import { sendPushes } from "@/lib/push/send";
import { checkReceipts } from "@/lib/push/receipts";
import { dropMessage, streakMessage, versusMessage, type PushMessage } from "@/lib/push/messages";
import { inSlot, isAway, SLOTS, streakDue } from "@/lib/push/who";
import { localClock, zoneOrSydney } from "@/lib/push/zones";
import { currentDrop } from "@/lib/drop";
import { getStreak } from "@/lib/streak";
import { countPicks, getMatchupForDay, getTodaysMatchup, shiftDay, sydneyDay } from "@/lib/versus";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Streak } from "@/lib/app-api";
import type { VersusMatchup } from "@/lib/versus-shared";

export type TickDeps = {
  candidates: typeof store.tickCandidates;
  todaysMatchup: () => Promise<VersusMatchup | null>;
  matchupForDay: (day: string) => Promise<VersusMatchup | null>;
  picksIn: typeof store.picksIn;
  countPicks: (matchupId: number) => Promise<{ left: number; right: number }>;
  ratedAlbum: typeof store.ratedAlbum;
  loggedAlready: typeof store.loggedAlready;
  streakOf: (userId: string, timeZone: string) => Promise<Streak>;
  send: (messages: PushMessage[]) => Promise<number>;
  checkReceipts: (at: Date) => Promise<number>;
  pruneLog: (at: Date) => Promise<void>;
};

const real = (): TickDeps => ({
  candidates: store.tickCandidates,
  todaysMatchup: getTodaysMatchup,
  matchupForDay: getMatchupForDay,
  picksIn: store.picksIn,
  countPicks,
  ratedAlbum: store.ratedAlbum,
  loggedAlready: store.loggedAlready,
  streakOf: (userId, timeZone) => getStreak(userId, timeZone, createAdminClient()),
  send: (messages) => sendPushes(messages),
  checkReceipts: (at) => checkReceipts(at),
  pruneLog: store.pruneLog,
});

export type TickReport = { due: number; sent: number; receipts: number };

type Candidate = store.Candidate;

async function versusPushes(people: Candidate[], at: Date, deps: TickDeps): Promise<PushMessage[]> {
  const today = await deps.todaysMatchup();
  if (!today) return [];
  const day = sydneyDay(at);
  const logged = await deps.loggedAlready(
    "versus",
    day,
    people.map((p) => p.userId),
  );
  const due = people.filter((p) => !logged.has(p.userId));
  if (due.length === 0) return [];

  const yesterday = await deps.matchupForDay(shiftDay(day, -1));
  const picked = yesterday
    ? await deps.picksIn(
        yesterday.id,
        due.map((p) => p.userId),
      )
    : new Set<string>();
  const tally = yesterday && picked.size > 0 ? await deps.countPicks(yesterday.id) : null;

  return due.map((p) => {
    const result =
      yesterday && tally && picked.has(p.userId) && tally.left + tally.right > 0
        ? {
            title: yesterday.title,
            winner:
              tally.left > tally.right
                ? yesterday.left.name
                : tally.right > tally.left
                  ? yesterday.right.name
                  : null,
            left: tally.left,
            right: tally.right,
          }
        : undefined;
    return { userId: p.userId, kind: "versus", key: day, ...versusMessage(today, result) };
  });
}

async function dropPushes(people: Candidate[], at: Date, deps: TickDeps): Promise<PushMessage[]> {
  const drop = currentDrop(at);
  const key = `week-${drop.week}`;
  const ids = people.map((p) => p.userId);
  const [logged, rated] = await Promise.all([
    deps.loggedAlready("drop", key, ids),
    deps.ratedAlbum(drop.album.mbid, ids),
  ]);
  return people
    .filter((p) => !logged.has(p.userId) && !rated.has(p.userId))
    .map((p) => ({ userId: p.userId, kind: "drop", key, ...dropMessage() }));
}

async function streakPushes(people: Candidate[], at: Date, deps: TickDeps): Promise<PushMessage[]> {
  // Each person's key is their own local day, so group them by it.
  const byDay = new Map<string, Candidate[]>();
  for (const p of people) {
    const { day } = localClock(at, zoneOrSydney(p.timeZone));
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }

  const messages: PushMessage[] = [];
  for (const [day, group] of byDay) {
    const logged = await deps.loggedAlready(
      "streak",
      day,
      group.map((p) => p.userId),
    );
    for (const p of group) {
      if (logged.has(p.userId)) continue;
      const streak = await deps.streakOf(p.userId, zoneOrSydney(p.timeZone));
      if (streakDue(streak)) {
        messages.push({
          userId: p.userId,
          kind: "streak",
          key: day,
          ...streakMessage(streak.days),
        });
      }
    }
  }
  return messages;
}

/**
 * One run of the clock, every 15 minutes: the timed pushes due where each
 * person is, then Expo's receipts and a tidy of the log.
 */
export async function runTick(at = new Date(), deps: TickDeps = real()): Promise<TickReport> {
  const awake = (await deps.candidates()).filter((p) => !isAway(p.lastSeenAt, at));
  const due = (slot: number, on: (p: Candidate) => boolean) =>
    awake.filter((p) => on(p) && inSlot(at, zoneOrSydney(p.timeZone), slot));

  const versus = due(SLOTS.versus, (p) => p.settings.versus);
  const drop = due(SLOTS.drop, (p) => p.settings.drop);
  const streak = due(SLOTS.streak, (p) => p.settings.streak);

  const messages = [
    ...(versus.length ? await versusPushes(versus, at, deps) : []),
    ...(drop.length ? await dropPushes(drop, at, deps) : []),
    ...(streak.length ? await streakPushes(streak, at, deps) : []),
  ];

  const sent = await deps.send(messages);
  const receipts = await deps.checkReceipts(at);
  await deps.pruneLog(at);
  return { due: messages.length, sent, receipts };
}
