import type { NotificationSettings, Streak } from "@/lib/app-api";
import { localClock } from "@/lib/push/zones";

/**
 * Who gets which push, and when. Pure rules, so they're tested without a
 * database; `tick.ts` and `events.ts` feed them.
 */

export type PushKind =
  "follow" | "love" | "reply" | "versus" | "drop" | "streak" | "diary" | "release";

/** Minutes past local midnight when each timed push goes out. */
export const SLOTS = { versus: 9 * 60, release: 10 * 60, drop: 12 * 60, streak: 19 * 60 } as const;

/** A missed run of the clock is caught up within this; after it, the push is stale. */
const WINDOW_MINUTES = 60;

/** Timed pushes stop for somebody who hasn't been here this long. */
const AWAY_DAYS = 30;

export const ALL_ON: NotificationSettings = {
  follows: true,
  loves: true,
  replies: true,
  versus: true,
  drop: true,
  streak: true,
  diary: true,
  releases: true,
};

/** Whether it's within the hour after `slot` where somebody is. */
export function inSlot(at: Date, timeZone: string, slot: number): boolean {
  const { minutes } = localClock(at, timeZone);
  return minutes >= slot && minutes < slot + WINDOW_MINUTES;
}

export function isAway(lastSeenAt: string | null, at: Date): boolean {
  if (!lastSeenAt) return true;
  return at.getTime() - Date.parse(lastSeenAt) > AWAY_DAYS * 86_400_000;
}

const SWITCH: Record<PushKind, keyof NotificationSettings> = {
  follow: "follows",
  love: "loves",
  reply: "replies",
  versus: "versus",
  drop: "drop",
  streak: "streak",
  diary: "diary",
  release: "releases",
};

export function wants(settings: NotificationSettings, kind: PushKind): boolean {
  return settings[SWITCH[kind]];
}

/** One push per subject per hour (UTC): loves on one review, say. */
export function hourKey(subject: string, at: Date): string {
  return `${subject}:${at.toISOString().slice(0, 13)}`;
}

/** One push per subject per day (UTC): the same follower, say. */
export function dayKey(subject: string, at: Date): string {
  return `${subject}:${at.toISOString().slice(0, 10)}`;
}

/** A streak worth a reminder: two days or more, and nothing done yet today. */
export function streakDue(streak: Streak): boolean {
  return streak.days >= 2 && !streak.today;
}
