import "server-only";
import * as store from "@/lib/push/store";
import { sendPushes } from "@/lib/push/send";
import { checkReceipts } from "@/lib/push/receipts";
import { dropMessage, streakMessage, versusMessage, type PushMessage } from "@/lib/push/messages";
import { inSlot, isAway, SLOTS, streakDue, type PushKind } from "@/lib/push/who";
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
  send: (messages: PushMessage[], deadline: number) => Promise<number>;
  checkReceipts: (at: Date, deadline: number) => Promise<number>;
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
  send: (messages, deadline) => sendPushes(messages, undefined, { deadline }),
  checkReceipts: (at, deadline) => checkReceipts(at, undefined, { deadline }),
  pruneLog: store.pruneLog,
});

export type TickReport = { due: number; sent: number; receipts: number; errors: number };

/**
 * Nothing new starts after this long (streak checks, batches of pushes or of
 * receipts), so a run ends well inside the endpoint's 60 seconds. What's
 * left is picked up by the next run: nothing was claimed for it.
 */
const BUDGET_MS = 40_000;

/** How many streak checks run at once. */
const STREAK_CONCURRENCY = 5;

type Candidate = store.Candidate;

/** People grouped by their own local day, which is what a timed push is keyed by. */
function byLocalDay(people: Candidate[], at: Date): Map<string, Candidate[]> {
  const days = new Map<string, Candidate[]>();
  for (const p of people) {
    const { day } = localClock(at, zoneOrSydney(p.timeZone));
    const group = days.get(day);
    if (group) group.push(p);
    else days.set(day, [p]);
  }
  return days;
}

/** The people not yet sent `kind` for their own day, with that day. */
async function notLogged(
  kind: PushKind,
  people: Candidate[],
  at: Date,
  deps: TickDeps,
): Promise<{ person: Candidate; day: string }[]> {
  const due: { person: Candidate; day: string }[] = [];
  for (const [day, group] of byLocalDay(people, at)) {
    const logged = await deps.loggedAlready(
      kind,
      day,
      group.map((p) => p.userId),
    );
    for (const person of group) if (!logged.has(person.userId)) due.push({ person, day });
  }
  return due;
}

async function versusPushes(people: Candidate[], at: Date, deps: TickDeps): Promise<PushMessage[]> {
  const today = await deps.todaysMatchup();
  if (!today) return [];
  // Each person's key is their own local day, so a window that spans Sydney's
  // midnight can't send twice. The matchup is still Sydney's today.
  const due = await notLogged("versus", people, at, deps);
  if (due.length === 0) return [];

  const yesterday = await deps.matchupForDay(shiftDay(sydneyDay(at), -1));
  const picked = yesterday
    ? await deps.picksIn(
        yesterday.id,
        due.map((d) => d.person.userId),
      )
    : new Set<string>();
  const tally = yesterday && picked.size > 0 ? await deps.countPicks(yesterday.id) : null;

  return due.map(({ person, day }) => {
    const result =
      yesterday && tally && picked.has(person.userId) && tally.left + tally.right > 0
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
    return { userId: person.userId, kind: "versus", key: day, ...versusMessage(today, result) };
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

/** Runs `work` over `items`, at most `limit` at once, none started after `deadline`. */
async function paced<T>(
  items: T[],
  limit: number,
  deadline: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++] as T;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function streakPushes(
  people: Candidate[],
  at: Date,
  deps: TickDeps,
  deadline: number,
  failed: () => void,
): Promise<PushMessage[]> {
  const messages: PushMessage[] = [];
  const due = await notLogged("streak", people, at, deps);
  await paced(due, STREAK_CONCURRENCY, deadline, async ({ person, day }) => {
    try {
      const streak = await deps.streakOf(person.userId, zoneOrSydney(person.timeZone));
      if (streakDue(streak)) {
        messages.push({
          userId: person.userId,
          kind: "streak",
          key: day,
          ...streakMessage(streak.days),
        });
      }
    } catch (error) {
      failed();
      console.error("[push] a streak check failed:", error);
    }
  });
  return messages;
}

/**
 * One run of the clock, every 15 minutes: the timed pushes due where each
 * person is, then Expo's receipts and a tidy of the log. A failure in one step
 * is logged and counted, and the rest carry on.
 */
export async function runTick(
  at = new Date(),
  deps: TickDeps = real(),
  options: { deadline?: number } = {},
): Promise<TickReport> {
  const deadline = options.deadline ?? Date.now() + BUDGET_MS;
  let errors = 0;
  const attempt = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      errors += 1;
      console.error(`[push] ${what} failed:`, error);
      return fallback;
    }
  };

  const awake = await attempt(
    "candidates",
    async () => (await deps.candidates()).filter((p) => !isAway(p.lastSeenAt, at)),
    [] as Candidate[],
  );
  const due = (slot: number, on: (p: Candidate) => boolean) =>
    awake.filter((p) => on(p) && inSlot(at, zoneOrSydney(p.timeZone), slot));

  const versus = due(SLOTS.versus, (p) => p.settings.versus);
  const drop = due(SLOTS.drop, (p) => p.settings.drop);
  const streak = due(SLOTS.streak, (p) => p.settings.streak);

  const messages = [
    ...(versus.length
      ? await attempt("versus pushes", () => versusPushes(versus, at, deps), [])
      : []),
    ...(drop.length ? await attempt("drop pushes", () => dropPushes(drop, at, deps), []) : []),
    ...(streak.length
      ? await attempt(
          "streak pushes",
          () =>
            streakPushes(streak, at, deps, deadline, () => {
              errors += 1;
            }),
          [],
        )
      : []),
  ];

  const late = () => Date.now() >= deadline;
  const sent = late() ? 0 : await attempt("sending", () => deps.send(messages, deadline), 0);
  const receipts = late()
    ? 0
    : await attempt("receipts", () => deps.checkReceipts(at, deadline), 0);
  await attempt("pruning", () => deps.pruneLog(at), undefined);
  return { due: messages.length, sent, receipts, errors };
}
