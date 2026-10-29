import "server-only";
import type { Notification, Person } from "@/lib/app-api";
import { threadHref, type ThreadKind } from "@/lib/replies-shared";
import { isMissingTable, logQueryError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { MATCHUP_SELECT, toMatchup, type MatchupRow } from "@/lib/versus";

/**
 * The bell's lines about replies, worked out from the tables when it's read,
 * like the rest of the bell: replies on your own review or take, being named
 * in somebody else's thread, and what's new in threads you've replied in.
 * Read through your own session, so row-level security leaves out anybody
 * blocked either way. Who a reply names is kept when it's posted
 * (`reply_mentions`, migration 0024), so it's never searched for in the
 * words.
 */

/** The thread a reply is in, as the bell names it. */
export type BellThread = {
  kind: ThreadKind;
  id: number;
  ownerId: string;
  /** Whose review or take, by name. */
  owner: string;
  /** The record's or matchup's title. */
  title: string;
  href: string;
};

export type BellReply = {
  id: number;
  body: string;
  at: string;
  person: Person;
  thread: BellThread;
};

type Owner = { username: string; display_name: string | null } | null;

/** A reply row as the bell reads it, with whichever thread it's in. */
export type BellRow = {
  id: number;
  body: string;
  created_at: string;
  user_id: string;
  profiles: Person;
  ratings?: {
    id: number;
    user_id: string;
    release_mbid: string;
    releases: { title: string } | null;
    profiles: Owner;
  } | null;
  artist_ratings?: {
    id: number;
    user_id: string;
    artist_mbid: string;
    artists: { name: string } | null;
    profiles: Owner;
  } | null;
  versus_takes?: {
    id: number;
    user_id: string;
    profiles: Owner;
    versus_matchups: MatchupRow | null;
  } | null;
};

const nameOf = (owner: { username: string; display_name: string | null }) =>
  owner.display_name || owner.username;
const keyOf = (thread: { kind: ThreadKind; id: number }) => `${thread.kind}-${thread.id}`;
const on = (kind: ThreadKind): "review" | "take" => (kind === "take" ? "take" : "review");

export function toBellReply(row: BellRow): BellReply | null {
  const reply = { id: row.id, body: row.body, at: row.created_at, person: row.profiles };
  const r = row.ratings;
  if (r?.releases && r.profiles) {
    return {
      ...reply,
      thread: {
        kind: "album",
        id: r.id,
        ownerId: r.user_id,
        owner: nameOf(r.profiles),
        title: r.releases.title,
        href: threadHref({ kind: "album", mbid: r.release_mbid, id: r.id }),
      },
    };
  }
  const a = row.artist_ratings;
  if (a?.artists && a.profiles) {
    return {
      ...reply,
      thread: {
        kind: "artist",
        id: a.id,
        ownerId: a.user_id,
        owner: nameOf(a.profiles),
        title: a.artists.name,
        href: threadHref({ kind: "artist", mbid: a.artist_mbid, id: a.id }),
      },
    };
  }
  const t = row.versus_takes;
  if (t?.versus_matchups && t.profiles) {
    const matchup = toMatchup(t.versus_matchups);
    return {
      ...reply,
      thread: {
        kind: "take",
        id: t.id,
        ownerId: t.user_id,
        owner: nameOf(t.profiles),
        title: matchup.title,
        href: threadHref({ kind: "take", day: matchup.day, id: t.id }),
      },
    };
  }
  return null;
}

/** Replies grouped by thread, each group newest first, the groups in order of their newest. */
function byThread(replies: BellReply[]): BellReply[][] {
  const groups = new Map<string, BellReply[]>();
  const newestFirst = [...replies].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const reply of newestFirst) {
    const key = keyOf(reply.thread);
    groups.set(key, [...(groups.get(key) ?? []), reply]);
  }
  return [...groups.values()];
}

/**
 * The three lines, from what was read. A reply on your own review that
 * names you is a `reply` line only; one that names you isn't counted again
 * in a `thread` line.
 */
export function replyBell(
  me: { id: string },
  read: {
    /** Replies on your own reviews and takes. */
    onMine: BellReply[];
    /** Replies that named you. */
    mentions: BellReply[];
    /** Replies in threads you've replied in. */
    followUps: BellReply[];
    /** Each of those threads' key, and when you last replied there. */
    myLatest: ReadonlyMap<string, string>;
  },
): Notification[] {
  const others = (reply: BellReply) => reply.person.id !== me.id;
  const lines: Notification[] = [];

  for (const group of byThread(
    read.onMine.filter((r) => others(r) && r.thread.ownerId === me.id),
  )) {
    const [newest] = group;
    if (!newest) continue;
    lines.push({
      kind: "reply",
      key: `reply-${keyOf(newest.thread)}`,
      at: newest.at,
      person: newest.person,
      others: new Set(group.map((r) => r.person.id)).size - 1,
      on: on(newest.thread.kind),
      subject: { title: newest.thread.title, href: newest.thread.href },
    });
  }

  const named = new Set<number>();
  for (const reply of read.mentions) {
    if (!others(reply) || reply.thread.ownerId === me.id || named.has(reply.id)) continue;
    named.add(reply.id);
    lines.push({
      kind: "mention",
      key: `mention-${reply.id}`,
      at: reply.at,
      person: reply.person,
      owner: reply.thread.owner,
      on: on(reply.thread.kind),
      subject: { title: reply.thread.title, href: reply.thread.href },
    });
  }

  const since = read.followUps.filter((reply) => {
    const last = read.myLatest.get(keyOf(reply.thread));
    return (
      others(reply) &&
      reply.thread.ownerId !== me.id &&
      !named.has(reply.id) &&
      last !== undefined &&
      Date.parse(reply.at) > Date.parse(last)
    );
  });
  for (const group of byThread(since)) {
    const [newest] = group;
    if (!newest) continue;
    lines.push({
      kind: "thread",
      key: `thread-${keyOf(newest.thread)}`,
      at: newest.at,
      person: newest.person,
      count: group.length,
      owner: newest.thread.owner,
      on: on(newest.thread.kind),
      subject: { title: newest.thread.title, href: newest.thread.href },
    });
  }

  return lines;
}

const REPLY =
  "id, body, created_at, user_id, profiles!inner ( id, username, display_name, avatar_url )";
/** Whichever thread a reply is in, named. */
const THREAD = [
  "ratings ( id, user_id, release_mbid, releases ( title ), profiles ( username, display_name ) )",
  "artist_ratings ( id, user_id, artist_mbid, artists ( name ), profiles ( username, display_name ) )",
  `versus_takes ( id, user_id, profiles ( username, display_name ), versus_matchups ( ${MATCHUP_SELECT} ) )`,
].join(", ");
const BELL = `${REPLY}, ${THREAD}`;

const COLUMN = { album: "rating_id", artist: "artist_rating_id", take: "versus_take_id" } as const;
const NEWEST = { ascending: false } as const;

/** How many of your own latest replies are read to find the threads you're in. */
const MY_REPLIES_LOOK = 200;

/** The most threads you've replied in that the bell follows, your most recent first. */
export const THREADS_FOLLOWED = 50;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Read = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A read's rows. A failed one is logged and reads as none, so the rest of the
 * bell still shows; before migration 0024 has run there's nothing to log.
 */
function rowsOf<Row>(result: Read | null): Row[] {
  if (!result) return [];
  if (result.error) {
    if (!isMissingTable(result.error)) logQueryError("replies", result.error);
    return [];
  }
  return (result.data ?? []) as Row[];
}

type MyReply = {
  rating_id: number | null;
  artist_rating_id: number | null;
  versus_take_id: number | null;
  thread_owner_id: string | null;
  created_at: string;
};

/** A thread you've replied in, and when you last did. */
type Followed = { kind: ThreadKind; id: number; at: string };

/**
 * The threads on other people's reviews and takes you've replied in most
 * recently, at most fifty, keyed by thread, each with your latest reply
 * there. Replies on your own are `reply` lines already.
 */
async function threadsFollowed(supabase: Supabase, userId: string) {
  const result = await supabase
    .from("replies")
    .select("rating_id, artist_rating_id, versus_take_id, thread_owner_id, created_at")
    .eq("user_id", userId)
    .order("created_at", NEWEST)
    .limit(MY_REPLIES_LOOK);

  // Newest first, so the first seen of each thread is your latest there.
  const threads = new Map<string, Followed>();
  for (const row of rowsOf<MyReply>(result)) {
    if (row.thread_owner_id === userId) continue;
    const kind: ThreadKind = row.rating_id ? "album" : row.artist_rating_id ? "artist" : "take";
    const id = row.rating_id ?? row.artist_rating_id ?? row.versus_take_id;
    if (id === null) continue;
    const key = keyOf({ kind, id });
    if (!threads.has(key)) threads.set(key, { kind, id, at: row.created_at });
    if (threads.size === THREADS_FOLLOWED) break;
  }
  return threads;
}

/**
 * Replies by others newer than your own latest, in each thread you follow:
 * exact per thread, so a busy thread can't crowd out what's new elsewhere.
 * The times are quoted, since they hold "." and ":".
 */
function newerThanYours(supabase: Supabase, userId: string, threads: Map<string, Followed>) {
  const since = [...threads.values()]
    .map((t) => `and(${COLUMN[t.kind]}.eq.${t.id},created_at.gt."${t.at}")`)
    .join(",");
  return (columns: string) =>
    supabase
      .from("replies")
      .select(columns)
      .neq("user_id", userId)
      .or(since)
      .order("created_at", NEWEST);
}

const bell = (rows: BellRow[]) =>
  rows.flatMap((row) => {
    const reply = toBellReply(row);
    return reply ? [reply] : [];
  });

/**
 * Somebody's reply lines for the bell, in four reads at most: replies on
 * their own reviews and takes, the replies that named them (kept when each
 * was posted, by `recordMentions`), and their fifty most recent threads, then
 * what's new in those.
 */
export async function getReplyNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const supabase = await createClient();

  const [onMine, mentions, threads] = await Promise.all([
    supabase
      .from("replies")
      .select(BELL)
      .eq("thread_owner_id", userId)
      .neq("user_id", userId)
      .order("created_at", NEWEST)
      .limit(limit),
    supabase
      .from("reply_mentions")
      .select(`replies!inner ( ${BELL} )`)
      .eq("user_id", userId)
      .order("reply_id", NEWEST)
      .limit(limit),
    threadsFollowed(supabase, userId),
  ]);

  const followUps =
    threads.size > 0
      ? rowsOf<BellRow>(await newerThanYours(supabase, userId, threads)(BELL).limit(limit * 2))
      : [];

  return replyBell(
    { id: userId },
    {
      onMine: bell(rowsOf<BellRow>(onMine)),
      mentions: bell(rowsOf<{ replies: BellRow }>(mentions).map((row) => row.replies)),
      followUps: bell(followUps),
      myLatest: new Map([...threads].map(([key, thread]) => [key, thread.at])),
    },
  );
}

/**
 * When the newest of somebody's reply lines happened, for the dot on the
 * bell, without working the lines out: the newest reply to them, the newest
 * that named them, and the newest in a thread they follow since their own
 * latest there. Times only, in four small reads; row-level security leaves
 * out anybody blocked either way.
 */
export async function latestReplyActivityAt(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const followUp = async () => {
    const threads = await threadsFollowed(supabase, userId);
    if (threads.size === 0) return null;
    return newerThanYours(supabase, userId, threads)("created_at").limit(1);
  };

  const [onMine, mention, followed] = await Promise.all([
    supabase
      .from("replies")
      .select("created_at")
      .eq("thread_owner_id", userId)
      .neq("user_id", userId)
      .order("created_at", NEWEST)
      .limit(1),
    supabase
      .from("reply_mentions")
      .select("replies!inner ( created_at )")
      .eq("user_id", userId)
      .order("reply_id", NEWEST)
      .limit(1),
    followUp(),
  ]);

  const times = [
    ...rowsOf<{ created_at: string }>(onMine),
    ...rowsOf<{ replies: { created_at: string } }>(mention).map((row) => row.replies),
    ...rowsOf<{ created_at: string }>(followed),
  ]
    .map((row) => row.created_at)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return times[0] ?? null;
}
