import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATCHUP_SELECT, toMatchup, type MatchupRow } from "@/lib/versus";
import type { NotificationSettings, PushPlatform } from "@/lib/app-api";
import type { LoveSubject, Person } from "@/lib/push/messages";
import { ALL_ON, type PushKind } from "@/lib/push/who";

/**
 * Everything push notifications keep in the database (migration 0023). The
 * tables are closed to the public roles, so this reads and writes them with
 * the service role, always for a person the caller has already checked.
 */

const db = () => createAdminClient();

/** Somebody's time zone, or null when we don't know it (or can't read it yet). */
export async function readTimeZone(userId: string): Promise<string | null> {
  try {
    const { data, error } = await db()
      .from("personal_settings")
      .select("time_zone")
      .eq("user_id", userId)
      .maybeSingle();
    return error ? null : (data?.time_zone ?? null);
  } catch {
    // A missing key or a dropped connection must not break a page that only wants a streak.
    return null;
  }
}

const SETTINGS =
  "notify_follows, notify_loves, notify_replies, notify_versus, notify_drop, notify_streak";

type SettingsRow = {
  notify_follows: boolean;
  notify_loves: boolean;
  notify_replies: boolean;
  notify_versus: boolean;
  notify_drop: boolean;
  notify_streak: boolean;
};

const COLUMN = {
  follows: "notify_follows",
  loves: "notify_loves",
  replies: "notify_replies",
  versus: "notify_versus",
  drop: "notify_drop",
  streak: "notify_streak",
} as const satisfies Record<keyof NotificationSettings, keyof SettingsRow>;

/** A missing row means nothing was ever switched off. */
export function toSettings(row: SettingsRow | null | undefined): NotificationSettings {
  if (!row) return { ...ALL_ON };
  return {
    follows: row.notify_follows,
    loves: row.notify_loves,
    replies: row.notify_replies,
    versus: row.notify_versus,
    drop: row.notify_drop,
    streak: row.notify_streak,
  };
}

export function toColumns(patch: Partial<NotificationSettings>): Partial<SettingsRow> {
  const columns: Partial<SettingsRow> = {};
  for (const [name, value] of Object.entries(patch) as [keyof NotificationSettings, boolean][]) {
    columns[COLUMN[name]] = value;
  }
  return columns;
}

export async function readSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await db()
    .from("personal_settings")
    .select(SETTINGS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return toSettings(data);
}

export async function saveSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<void> {
  const { error } = await db()
    .from("personal_settings")
    .upsert({ user_id: userId, ...toColumns(patch) }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function readSwitches(userIds: string[]): Promise<Map<string, NotificationSettings>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await db()
    .from("personal_settings")
    .select(`user_id, ${SETTINGS}`)
    .in("user_id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.user_id, toSettings(row)]));
}

/**
 * Notes that somebody was here, and their time zone when it's known. Written
 * at most once an hour unless the zone changed, so a busy visitor costs one read.
 */
export async function touchClock(
  userId: string,
  timeZone: string | null,
  at = new Date(),
): Promise<void> {
  const client = db();
  const { data } = await client
    .from("personal_settings")
    .select("time_zone, last_seen_at")
    .eq("user_id", userId)
    .maybeSingle();
  const fresh = data?.last_seen_at
    ? at.getTime() - Date.parse(data.last_seen_at) < 3_600_000
    : false;
  if (fresh && (timeZone === null || data?.time_zone === timeZone)) return;

  const { error } = await client.from("personal_settings").upsert(
    {
      user_id: userId,
      last_seen_at: at.toISOString(),
      ...(timeZone ? { time_zone: timeZone } : {}),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/** Registers a phone; one registered by another account before moves to this one. */
export async function registerDevice(
  userId: string,
  token: string,
  platform: PushPlatform,
  at = new Date(),
): Promise<void> {
  const { error } = await db()
    .from("push_devices")
    .upsert(
      { token, user_id: userId, platform, last_seen_at: at.toISOString() },
      { onConflict: "token" },
    );
  if (error) throw error;
}

export async function removeDevice(userId: string, token: string): Promise<void> {
  const { error } = await db()
    .from("push_devices")
    .delete()
    .eq("token", token)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function devicesOf(userIds: string[]): Promise<{ token: string; user_id: string }[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await db()
    .from("push_devices")
    .select("token, user_id")
    .in("user_id", userIds);
  if (error) throw error;
  return data ?? [];
}

export async function dropTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await db().from("push_devices").delete().in("token", tokens);
  if (error) throw error;
}

export type LogEntry = { userId: string; kind: PushKind; key: string };
export type Ticketed = { id: string; token: string };

export const logKey = (entry: LogEntry) => `${entry.userId}|${entry.kind}|${entry.key}`;

/**
 * Writes each push into the log before it's sent, and answers the ones this
 * call wrote. One already there was sent (or is being sent) by someone else,
 * so overlapping runs of the clock can't send anything twice.
 */
export async function claimPushes(entries: LogEntry[]): Promise<Set<string>> {
  if (entries.length === 0) return new Set();
  const { data, error } = await db()
    .from("push_log")
    .upsert(
      entries.map((e) => ({ user_id: e.userId, kind: e.kind, key: e.key })),
      { onConflict: "user_id,kind,key", ignoreDuplicates: true },
    )
    .select("user_id, kind, key");
  if (error) throw error;
  return new Set(
    (data ?? []).map((row) =>
      logKey({ userId: row.user_id, kind: row.kind as PushKind, key: row.key }),
    ),
  );
}

export async function saveTickets(entry: LogEntry, tickets: Ticketed[]): Promise<void> {
  const { error } = await db()
    .from("push_log")
    .update({ tickets })
    .eq("user_id", entry.userId)
    .eq("kind", entry.kind)
    .eq("key", entry.key);
  if (error) throw error;
}

/** Who already has this push in the log. */
export async function loggedAlready(
  kind: PushKind,
  key: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("push_log")
    .select("user_id")
    .eq("kind", kind)
    .eq("key", key)
    .in("user_id", userIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}

export type LoggedTickets = LogEntry & { tickets: Ticketed[] };

/** Pushes sent 15 minutes to a day ago whose receipts haven't been read (Expo keeps them a day). */
export async function uncheckedTickets(at: Date): Promise<LoggedTickets[]> {
  const { data, error } = await db()
    .from("push_log")
    .select("user_id, kind, key, tickets")
    .eq("receipts_checked", false)
    .lt("sent_at", new Date(at.getTime() - 15 * 60_000).toISOString())
    .gt("sent_at", new Date(at.getTime() - 24 * 3_600_000).toISOString())
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    kind: row.kind as PushKind,
    key: row.key,
    tickets: (row.tickets ?? []) as Ticketed[],
  }));
}

export async function markChecked(entries: LogEntry[]): Promise<void> {
  const client = db();
  await Promise.all(
    entries.map((e) =>
      client
        .from("push_log")
        .update({ receipts_checked: true })
        .eq("user_id", e.userId)
        .eq("kind", e.kind)
        .eq("key", e.key),
    ),
  );
}

/** The log only needs to remember a month. */
export async function pruneLog(at: Date): Promise<void> {
  const { error } = await db()
    .from("push_log")
    .delete()
    .lt("sent_at", new Date(at.getTime() - 30 * 86_400_000).toISOString());
  if (error) throw error;
}

export type Candidate = {
  userId: string;
  timeZone: string | null;
  lastSeenAt: string | null;
  settings: NotificationSettings;
};

/** Everybody with a phone to reach, with their clock and switches. */
export async function tickCandidates(): Promise<Candidate[]> {
  const client = db();
  const { data: devices, error } = await client
    .from("push_devices")
    .select("user_id")
    .limit(10_000);
  if (error) throw error;
  const ids = [...new Set((devices ?? []).map((d) => d.user_id))];

  const candidates: Candidate[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error: readError } = await client
      .from("personal_settings")
      .select(`user_id, time_zone, last_seen_at, ${SETTINGS}`)
      .in("user_id", ids.slice(i, i + 500));
    if (readError) throw readError;
    for (const row of data ?? []) {
      candidates.push({
        userId: row.user_id,
        timeZone: row.time_zone,
        lastSeenAt: row.last_seen_at,
        settings: toSettings(row),
      });
    }
  }
  return candidates;
}

/** Of these people, who picked in this matchup. */
export async function picksIn(matchupId: number, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("versus_votes")
    .select("user_id")
    .eq("matchup_id", matchupId)
    .in("user_id", userIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}

/** Of these people, who has rated this album. */
export async function ratedAlbum(mbid: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("ratings")
    .select("user_id")
    .eq("release_mbid", mbid)
    .in("user_id", userIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}

export async function personOf(userId: string): Promise<Person | null> {
  const { data } = await db()
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Whether either of two people has blocked the other (migration 0020). */
export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const { data, error } = await db().rpc("hidden_profiles", { p_user: a });
  // Before 0020 runs nobody is hidden, as everywhere else.
  if (error) return false;
  return (data ?? []).some((row) => row.id === b);
}

/** Whose rating or take was loved, and what to call it. */
export async function loveTarget(
  kind: "album" | "artist" | "take",
  id: number,
): Promise<{ ownerId: string; subject: LoveSubject } | null> {
  const client = db();
  if (kind === "album") {
    const { data } = await client
      .from("ratings")
      .select("user_id, release_mbid, review")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const { data: release } = await client
      .from("releases")
      .select("title")
      .eq("mbid", data.release_mbid)
      .maybeSingle();
    if (!release) return null;
    return {
      ownerId: data.user_id,
      subject: {
        kind: "album",
        mbid: data.release_mbid,
        title: release.title,
        review: Boolean(data.review?.trim()),
      },
    };
  }
  if (kind === "artist") {
    const { data } = await client
      .from("artist_ratings")
      .select("user_id, artist_mbid")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const { data: artist } = await client
      .from("artists")
      .select("name")
      .eq("mbid", data.artist_mbid)
      .maybeSingle();
    if (!artist) return null;
    return {
      ownerId: data.user_id,
      subject: { kind: "artist", mbid: data.artist_mbid, name: artist.name },
    };
  }
  const { data } = await client
    .from("versus_takes")
    .select("user_id, matchup_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { data: row } = await client
    .from("versus_matchups")
    .select(MATCHUP_SELECT)
    .eq("id", data.matchup_id)
    .maybeSingle();
  if (!row) return null;
  const matchup = toMatchup(row as MatchupRow);
  return {
    ownerId: data.user_id,
    subject: { kind: "take", day: matchup.day, title: matchup.title },
  };
}
