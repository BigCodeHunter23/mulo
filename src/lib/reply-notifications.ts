import "server-only";
import type { Notification, Person } from "@/lib/app-api";
import { parseMentions, threadHref, type ThreadKind } from "@/lib/replies-shared";
import { createClient } from "@/lib/supabase/server";
import { MATCHUP_SELECT, toMatchup, type MatchupRow } from "@/lib/versus";

/**
 * The bell's lines about replies, worked out from the tables when it's read,
 * like the rest of the bell: replies on your own review or take, being named
 * in somebody else's thread, and what's new in threads you've replied in.
 * Read through your own session, so row-level security leaves out anybody
 * blocked either way.
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
  me: { id: string; username: string },
  read: {
    /** Replies on your own reviews and takes. */
    onMine: BellReply[];
    /** Replies whose words might name you. */
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

  const name = me.username.toLowerCase();
  const named = new Set<number>();
  for (const reply of read.mentions) {
    if (!others(reply) || reply.thread.ownerId === me.id || named.has(reply.id)) continue;
    if (!parseMentions(reply.body).includes(name)) continue;
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
const ON_ALBUM =
  "ratings!inner ( id, user_id, release_mbid, releases ( title ), profiles ( username, display_name ) )";
const ON_ARTIST =
  "artist_ratings!inner ( id, user_id, artist_mbid, artists ( name ), profiles ( username, display_name ) )";
const ON_TAKE = `versus_takes!inner ( id, user_id, profiles ( username, display_name ), versus_matchups ( ${MATCHUP_SELECT} ) )`;
/** Any thread at all, for replies whose words might name you. */
const ON_ANY = [ON_ALBUM, ON_ARTIST, ON_TAKE].map((join) => join.replace("!inner", "")).join(", ");

const COLUMN = { album: "rating_id", artist: "artist_rating_id", take: "versus_take_id" } as const;

/**
 * Somebody's reply lines for the bell. Before migration 0024 there's nothing
 * to read, and there are none. At most `limit` threads are followed, so each
 * `.in()` list stays well under a hundred ids.
 */
export async function getReplyNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const newest = { ascending: false } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return [];

  const read = (join: string) =>
    supabase
      .from("replies")
      .select(`${REPLY}, ${join}`)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(limit);

  const [album, artist, take, mentions, mine] = await Promise.all([
    read(ON_ALBUM).eq("ratings.user_id", userId),
    read(ON_ARTIST).eq("artist_ratings.user_id", userId),
    read(ON_TAKE).eq("versus_takes.user_id", userId),
    // "_" is any one character to ilike; the words are checked properly after.
    read(ON_ANY).ilike("body", `%@${profile.username}%`),
    supabase
      .from("replies")
      .select("rating_id, artist_rating_id, versus_take_id, created_at")
      .eq("user_id", userId)
      .order("created_at", newest)
      .limit(limit),
  ]);
  if (mine.error) return [];

  // Newest first, so the first seen of each thread is your latest there.
  const myLatest = new Map<string, string>();
  for (const row of mine.data ?? []) {
    const kind: ThreadKind = row.rating_id ? "album" : row.artist_rating_id ? "artist" : "take";
    const id = row.rating_id ?? row.artist_rating_id ?? row.versus_take_id;
    if (id === null) continue;
    const key = `${kind}-${id}`;
    if (!myLatest.has(key)) myLatest.set(key, row.created_at);
  }
  const times = [...myLatest.values()].map((at) => Date.parse(at));
  const oldest = times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
  const idsOf = (kind: ThreadKind) =>
    [...myLatest.keys()]
      .filter((key) => key.startsWith(`${kind}-`))
      .map((key) => Number(key.slice(kind.length + 1)));

  const follow = async (kind: ThreadKind, join: string) => {
    const ids = idsOf(kind);
    if (ids.length === 0 || !oldest) return [];
    const { data } = await read(join).in(COLUMN[kind], ids).gt("created_at", oldest);
    return (data ?? []) as unknown as BellRow[];
  };
  const followUps = await Promise.all([
    follow("album", ON_ALBUM),
    follow("artist", ON_ARTIST),
    follow("take", ON_TAKE),
  ]);

  const bell = (rows: BellRow[]) =>
    rows.flatMap((row) => {
      const reply = toBellReply(row);
      return reply ? [reply] : [];
    });
  const rowsOf = (result: { data: unknown }) => (result.data ?? []) as BellRow[];

  return replyBell(
    { id: userId, username: profile.username },
    {
      onMine: bell([...rowsOf(album), ...rowsOf(artist), ...rowsOf(take)]),
      mentions: bell(rowsOf(mentions)),
      followUps: bell(followUps.flat()),
      myLatest,
    },
  );
}
