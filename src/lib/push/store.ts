import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATCHUP_SELECT, sydneyDay, toMatchup, type MatchupRow } from "@/lib/versus";
import type { NotificationSettings, PushPlatform } from "@/lib/app-api";
import type { LoveSubject, Person, ReplySubject } from "@/lib/push/messages";
import { ALL_ON, type PushKind } from "@/lib/push/who";
import { readAll } from "@/lib/supabase/read-all";
import { USERNAME_PATTERN } from "@/lib/validation";

/**
 * Everything push notifications keep in the database (migration 0023). The
 * tables are closed to the public roles, so this reads and writes them with
 * the service role, always for a person the caller has already checked.
 */

const db = () => createAdminClient();

/** `.in()` puts every id in the address, so long lists are read this many at a time. */
const CHUNK = 100;

async function inChunks<T>(ids: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    rows.push(...(await read(ids.slice(i, i + CHUNK))));
  }
  return rows;
}

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

/** What somebody's copy of their data says about pushes. */
export type PushCopy = {
  settings: (SettingsRow & { time_zone: string | null; last_seen_at: string | null }) | null;
  phones: { platform: string; created_at: string; last_seen_at: string }[];
};

/**
 * Somebody's push settings (switches, time zone, last visit) and their
 * phones, for their copy of their data. Never a phone's token: it's only an
 * address for pushes, and of no use to them.
 */
export async function pushCopyOf(userId: string): Promise<PushCopy> {
  const client = db();
  const [settings, phones] = await Promise.all([
    client
      .from("personal_settings")
      .select(`time_zone, last_seen_at, ${SETTINGS}`)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("push_devices")
      .select("platform, created_at, last_seen_at")
      .eq("user_id", userId)
      .order("created_at"),
  ]);
  if (settings.error) throw settings.error;
  if (phones.error) throw phones.error;
  return { settings: settings.data ?? null, phones: phones.data ?? [] };
}

export async function readSwitches(userIds: string[]): Promise<Map<string, NotificationSettings>> {
  if (userIds.length === 0) return new Map();
  const rows = await inChunks(userIds, async (chunk) => {
    const { data, error } = await db()
      .from("personal_settings")
      .select(`user_id, ${SETTINGS}`)
      .in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  return new Map(rows.map((row) => [row.user_id, toSettings(row)]));
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
  const { data, error: readError } = await client
    .from("personal_settings")
    .select("time_zone, last_seen_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
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

/**
 * Forgets a phone whatever account it's on, for the app when somebody leaves
 * it (log-out, an ended session, a deleted account), even once the session is
 * gone. Safe without a sign-in: knowing a token only lets you stop pushes to
 * that one phone, which re-registering it under another account can already do.
 */
export async function forgetDevice(token: string): Promise<void> {
  const { error } = await db().from("push_devices").delete().eq("token", token);
  if (error) throw error;
}

export async function devicesOf(userIds: string[]): Promise<{ token: string; user_id: string }[]> {
  if (userIds.length === 0) return [];
  return inChunks(userIds, async (chunk) => {
    const { data, error } = await db()
      .from("push_devices")
      .select("token, user_id")
      .in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
}

export async function dropTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await inChunks(tokens, async (chunk) => {
    const { error } = await db().from("push_devices").delete().in("token", chunk);
    if (error) throw error;
    return [];
  });
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
      // The column's check (migration 0023) allows only the PushKind names.
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
  const rows = await inChunks(userIds, async (chunk) => {
    const { data, error } = await db()
      .from("push_log")
      .select("user_id")
      .eq("kind", kind)
      .eq("key", key)
      .in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  return new Set(rows.map((row) => row.user_id));
}

/**
 * How many follow, love and reply pushes somebody has been sent since `since`, so a
 * crowd can't flood one phone (each push is once per follower or rating, but
 * there can be many of those).
 */
export async function peoplePushesSince(userId: string, since: Date): Promise<number> {
  const { count, error } = await db()
    .from("push_log")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", ["follow", "love", "reply"])
    .gt("sent_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export type LoggedTickets = LogEntry & { tickets: Ticketed[] };

/** The log's tickets column is JSON, so only entries of the shape `saveTickets` writes are kept. */
function toTickets(value: unknown): Ticketed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { id, token } = item as { id?: unknown; token?: unknown };
    return typeof id === "string" && typeof token === "string" ? [{ id, token }] : [];
  });
}

/** Pushes sent 15 minutes to a day ago whose receipts haven't been read (Expo keeps them a day). */
export async function uncheckedTickets(at: Date): Promise<LoggedTickets[]> {
  const { data, error } = await db()
    .from("push_log")
    .select("user_id, kind, key, tickets")
    .eq("receipts_checked", false)
    .lt("sent_at", new Date(at.getTime() - 15 * 60_000).toISOString())
    .gt("sent_at", new Date(at.getTime() - 24 * 3_600_000).toISOString())
    // Oldest first, so the ones closest to Expo's one-day limit are read before they go.
    .order("sent_at")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    // The column's check (migration 0023) allows only the PushKind names.
    kind: row.kind as PushKind,
    key: row.key,
    tickets: toTickets(row.tickets),
  }));
}

export async function markChecked(entries: LogEntry[]): Promise<void> {
  const client = db();
  // One update per (kind, key) for all its people, rather than one per push.
  const groups = new Map<string, { kind: PushKind; key: string; userIds: string[] }>();
  for (const e of entries) {
    const id = JSON.stringify([e.kind, e.key]);
    const group = groups.get(id) ?? { kind: e.kind, key: e.key, userIds: [] };
    group.userIds.push(e.userId);
    groups.set(id, group);
  }
  const updates: PromiseLike<{ error: unknown }>[] = [];
  for (const { kind, key, userIds } of groups.values()) {
    for (let i = 0; i < userIds.length; i += CHUNK) {
      updates.push(
        client
          .from("push_log")
          .update({ receipts_checked: true })
          .eq("kind", kind)
          .eq("key", key)
          .in("user_id", userIds.slice(i, i + CHUNK)),
      );
    }
  }
  // Let every update finish, then report the first that failed.
  const failed = (await Promise.all(updates)).find((result) => result.error);
  if (failed) throw failed.error;
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
  // A page at a time: the API quietly cuts a longer answer short.
  const { data: devices, error } = await readAll((from, to) =>
    client.from("push_devices").select("user_id").order("token").range(from, to),
  );
  if (error) throw new Error(error.message);
  const ids = [...new Set(devices.map((d) => d.user_id))];

  const rows = await inChunks(ids, async (chunk) => {
    const { data, error: readError } = await client
      .from("personal_settings")
      .select(`user_id, time_zone, last_seen_at, ${SETTINGS}`)
      .in("user_id", chunk);
    if (readError) throw readError;
    return data ?? [];
  });
  return rows.map((row) => ({
    userId: row.user_id,
    timeZone: row.time_zone,
    lastSeenAt: row.last_seen_at,
    settings: toSettings(row),
  }));
}

/** Of these people, who picked in this matchup. */
export async function picksIn(matchupId: number, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await inChunks(userIds, async (chunk) => {
    const { data, error } = await db()
      .from("versus_votes")
      .select("user_id")
      .eq("matchup_id", matchupId)
      .in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  return new Set(rows.map((row) => row.user_id));
}

/** Of these people, who has rated this album. */
export async function ratedAlbum(mbid: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await inChunks(userIds, async (chunk) => {
    const { data, error } = await db()
      .from("ratings")
      .select("user_id")
      .eq("release_mbid", mbid)
      .in("user_id", chunk);
    if (error) throw error;
    return data ?? [];
  });
  return new Set(rows.map((row) => row.user_id));
}

export async function personOf(userId: string): Promise<Person | null> {
  const { data, error } = await db()
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether either of two people has blocked the other (migration 0020). Reads
 * the table itself: hidden_profiles() answers only for the signed-in caller,
 * and the service role isn't signed in as anybody.
 */
export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  // Anything that isn't an id stays out of the filter, and stays quiet.
  if (!UUID.test(a) || !UUID.test(b)) return true;
  const { data, error } = await db()
    .from("blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  // Before 0020 runs nobody is blocked, as everywhere else. PostgREST names a
  // table it doesn't know PGRST205; Postgres itself says 42P01.
  if (error) return !(error.code === "42P01" || error.code === "PGRST205");
  return (data ?? []).length > 0;
}

/** Whose rating or take was loved, and what to call it. */

/** A read's row, or null when there is none; a failed read throws, so it's logged rather than mistaken for "not found". */
function found<Row>(result: { data: Row; error: unknown }): Row {
  if (result.error) throw result.error;
  return result.data;
}

export async function loveTarget(
  kind: "album" | "artist" | "take",
  id: number,
): Promise<{ ownerId: string; subject: LoveSubject } | null> {
  const client = db();
  if (kind === "album") {
    const data = found(
      await client
        .from("ratings")
        .select("user_id, release_mbid, review")
        .eq("id", id)
        .maybeSingle(),
    );
    if (!data) return null;
    const release = found(
      await client.from("releases").select("title").eq("mbid", data.release_mbid).maybeSingle(),
    );
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
    const data = found(
      await client.from("artist_ratings").select("user_id, artist_mbid").eq("id", id).maybeSingle(),
    );
    if (!data) return null;
    const artist = found(
      await client.from("artists").select("name").eq("mbid", data.artist_mbid).maybeSingle(),
    );
    if (!artist) return null;
    return {
      ownerId: data.user_id,
      subject: { kind: "artist", mbid: data.artist_mbid, name: artist.name },
    };
  }
  const data = found(
    await client.from("versus_takes").select("user_id, matchup_id").eq("id", id).maybeSingle(),
  );
  if (!data) return null;
  const row = found(
    await client
      .from("versus_matchups")
      .select(MATCHUP_SELECT)
      .eq("id", data.matchup_id)
      .maybeSingle(),
  );
  if (!row) return null;
  const matchup = toMatchup(row as MatchupRow);
  return {
    ownerId: data.user_id,
    subject: { kind: "take", day: matchup.day, title: matchup.title },
  };
}

/** Whose review or take was replied to, what it's called, and whether its matchup is open. */
export type ReplyTarget = {
  ownerId: string;
  owner: Person;
  subject: ReplySubject;
  /** A take on today's Versus: its matchup, since only people who picked may read it yet. */
  openMatchup: number | null;
};

export async function replyTarget(
  kind: "album" | "artist" | "take",
  id: number,
): Promise<ReplyTarget | null> {
  const client = db();
  if (kind === "album") {
    const data = found(
      await client
        .from("ratings")
        .select(
          "user_id, release_mbid, review, profiles!inner ( username, display_name ), releases!inner ( title )",
        )
        .eq("id", id)
        .maybeSingle(),
    );
    if (!data?.review?.trim()) return null;
    return {
      ownerId: data.user_id,
      owner: data.profiles,
      subject: { kind: "album", mbid: data.release_mbid, id, title: data.releases.title },
      openMatchup: null,
    };
  }
  if (kind === "artist") {
    const data = found(
      await client
        .from("artist_ratings")
        .select(
          "user_id, artist_mbid, review, profiles!inner ( username, display_name ), artists!inner ( name )",
        )
        .eq("id", id)
        .maybeSingle(),
    );
    if (!data?.review?.trim()) return null;
    return {
      ownerId: data.user_id,
      owner: data.profiles,
      subject: { kind: "artist", mbid: data.artist_mbid, id, name: data.artists.name },
      openMatchup: null,
    };
  }
  const data = found(
    await client
      .from("versus_takes")
      .select(
        `user_id, profiles!inner ( username, display_name ), versus_matchups!inner ( ${MATCHUP_SELECT} )`,
      )
      .eq("id", id)
      .maybeSingle(),
  );
  if (!data) return null;
  const matchup = toMatchup(data.versus_matchups as unknown as MatchupRow);
  return {
    ownerId: data.user_id,
    owner: data.profiles,
    subject: { kind: "take", day: matchup.day, id, title: matchup.title },
    openMatchup: matchup.day >= sydneyDay() ? matchup.id : null,
  };
}

/**
 * The people with these usernames, whatever the case, for @names. `ilike`
 * reads "_" as any one character, so only exact names are kept.
 */
export async function peopleNamed(
  usernames: string[],
): Promise<{ id: string; username: string; display_name: string | null }[]> {
  const wanted = new Set(
    usernames.map((name) => name.toLowerCase()).filter((name) => USERNAME_PATTERN.test(name)),
  );
  if (wanted.size === 0) return [];
  const { data, error } = await db()
    .from("profiles")
    .select("id, username, display_name")
    .or([...wanted].map((name) => `username.ilike.${name}`).join(","))
    .limit(50);
  if (error) throw error;
  return (data ?? []).filter((row) => wanted.has(row.username.toLowerCase()));
}
