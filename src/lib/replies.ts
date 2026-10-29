import "server-only";
import { cache } from "react";
import type { Person, Reply, ThreadHead, ThreadPage } from "@/lib/app-api";
import { hiddenPeople } from "@/lib/blocks";
import { getReactions, NO_REACTIONS } from "@/lib/reactions";
import { parseMentions, THREAD_MAX, type ThreadKind } from "@/lib/replies-shared";
import { isMissingFunction, isMissingTable, logQueryError } from "@/lib/supabase/errors";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPick, MATCHUP_SELECT, sydneyDay, toMatchup, type MatchupRow } from "@/lib/versus";

/**
 * Replies on reviews and takes (migration 0024): threads, counts, and
 * whether somebody may reply. Everything here is read through the visitor's
 * own session, so row-level security leaves out anybody blocked either way,
 * and signed out there are no replies to read. Writes are in
 * `src/app/replies/actions.ts`.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Which column of `replies` points at each kind of thread. */
export const REPLY_COLUMNS = {
  album: "rating_id",
  artist: "artist_rating_id",
  take: "versus_take_id",
} as const satisfies Record<ThreadKind, string>;

/** Said when somebody posts before migration 0024 has run. */
export const NOT_YET = "Replies aren't available yet.";

/** Said when somebody replies to a take on today's Versus before picking. */
export const PICK_FIRST = "Pick a side first, then join in.";

const GONE: ThreadPage = { state: "gone" };

/** Ids sent in one call for counts, to keep each request small. */
const CHUNK = 100;

/** Names asked about in one `or()`, to keep the address short. */
const NAMES_CHUNK = 50;

/** The most different @names looked up for one page. */
const NAMES_MAX = 100;

const PERSON = "profiles!inner ( id, username, display_name, avatar_url )";

/**
 * How many replies each review or take has, counted by the database
 * (`reply_counts`, migration 0024) as the visitor, so replies hidden from
 * them aren't counted: a call per hundred ids. Signed out there's nothing to
 * count (the page says "Replies"), and before migration 0024 runs every
 * count is 0.
 */
export async function getReplyCounts(
  kind: ThreadKind,
  ids: number[],
): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  for (const id of ids) counts[id] = 0;
  if (ids.length === 0) return counts;
  if (!(await getCurrentUser())) return counts;

  const supabase = await createClient();
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const answers = await Promise.all(
    chunks.map((chunk) => supabase.rpc("reply_counts", { p_kind: kind, p_ids: chunk })),
  );
  for (const { data, error } of answers) {
    if (error) {
      if (!isMissingFunction(error) && !isMissingTable(error)) logQueryError("replies", error);
      continue;
    }
    for (const row of data ?? []) {
      if (row.id !== null && row.id in counts) counts[row.id] = row.replies ?? 0;
    }
  }
  return counts;
}

/** A thread's review or take and whose it is; locked for an unpicked take; null when gone. */
type Found = { head: ThreadHead; ownerId: string } | { locked: string; ownerId: string } | null;

async function readHead(
  supabase: Supabase,
  kind: ThreadKind,
  id: number,
  userId: string | null,
): Promise<Found> {
  if (kind === "album") {
    const { data, error } = await supabase
      .from("ratings")
      .select(
        `id, user_id, score, review, created_at, ${PERSON}, releases!inner ( mbid, title, cover_art_url, artists ( mbid, name ) )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    // A score with no words has no thread.
    if (!data?.review?.trim()) return null;
    return {
      ownerId: data.user_id,
      head: {
        kind: "album",
        ratingId: data.id,
        reaction: NO_REACTIONS,
        created_at: data.created_at,
        author: data.profiles,
        score: data.score,
        review: data.review,
        release: {
          mbid: data.releases.mbid,
          title: data.releases.title,
          cover_art_url: data.releases.cover_art_url,
          artist: data.releases.artists,
        },
      },
    };
  }

  if (kind === "artist") {
    const { data, error } = await supabase
      .from("artist_ratings")
      .select(
        `id, user_id, score, review, created_at, ${PERSON}, artists!inner ( mbid, name, image_url )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.review?.trim()) return null;
    return {
      ownerId: data.user_id,
      head: {
        kind: "artist",
        ratingId: data.id,
        reaction: NO_REACTIONS,
        created_at: data.created_at,
        author: data.profiles,
        score: data.score,
        review: data.review,
        artist: data.artists,
      },
    };
  }

  const { data, error } = await supabase
    .from("versus_takes")
    .select(`id, body, created_at, user_id, ${PERSON}, versus_matchups!inner ( ${MATCHUP_SELECT} )`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const matchup = toMatchup(data.versus_matchups as unknown as MatchupRow);
  const open = matchup.day >= sydneyDay();
  const theirs = data.user_id === userId;
  const [viewerPick, side] = await Promise.all([
    userId && open && !theirs ? getPick(matchup.id, userId) : Promise.resolve(null),
    getPick(matchup.id, data.user_id),
  ]);
  // Like the split, takes on today's Versus wait until you've picked, so
  // nobody's talked into a side.
  if (open && !theirs && viewerPick === null) return { locked: matchup.day, ownerId: data.user_id };

  return {
    ownerId: data.user_id,
    head: {
      kind: "take",
      matchup,
      take: {
        id: data.id,
        body: data.body,
        createdAt: data.created_at,
        author: data.profiles,
        side,
        reactions: NO_REACTIONS,
        mine: theirs,
        replies: 0,
      },
    },
  };
}

type ReplyRow = { id: number; body: string; created_at: string; user_id: string; profiles: Person };

/**
 * A thread's newest replies, up to `THREAD_MAX`, oldest first, so a new reply
 * is never left off a long thread; `available` is false before migration 0024.
 */
async function readReplies(
  supabase: Supabase,
  kind: ThreadKind,
  id: number,
): Promise<{ rows: ReplyRow[]; available: boolean }> {
  const { data, error } = await supabase
    .from("replies")
    .select(`id, body, created_at, user_id, ${PERSON}`)
    .eq(REPLY_COLUMNS[kind], id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(THREAD_MAX);
  if (error) {
    if (isMissingTable(error)) return { rows: [], available: false };
    throw error;
  }
  const newestFirst = (data ?? []) as unknown as ReplyRow[];
  return { rows: [...newestFirst].reverse(), available: true };
}

/**
 * The real, visible people some replies name, by lower-cased name, each
 * with their own username: the first `NAMES_MAX` different names, asked
 * about together. `ilike` reads "_" as any one character, so only exact
 * names are kept.
 */
async function realNames(
  supabase: Supabase,
  bodies: string[],
  hidden: Set<string>,
): Promise<Map<string, string>> {
  const wanted = [...new Set(bodies.flatMap((body) => parseMentions(body)))].slice(0, NAMES_MAX);
  const chunks: string[][] = [];
  for (let i = 0; i < wanted.length; i += NAMES_CHUNK) {
    chunks.push(wanted.slice(i, i + NAMES_CHUNK));
  }
  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username")
        // "_" escaped, so "@a_c" can't match "abc" and crowd out real names.
        .or(chunk.map((name) => `username.ilike.${name.replace(/_/g, "\\_")}`).join(","));
      if (error) logQueryError("replies", error);
      return { chunk, rows: data ?? [] };
    }),
  );
  const found = new Map<string, string>();
  for (const { chunk, rows } of answers) {
    for (const row of rows) {
      const name = row.username.toLowerCase();
      if (chunk.includes(name) && !hidden.has(row.id)) found.set(name, row.username);
    }
  }
  return found;
}

const namedIn = (body: string, names: Map<string, string>) =>
  parseMentions(body).flatMap((name) => {
    const username = names.get(name);
    return username ? [username] : [];
  });

/** The real people a reply names, by their own usernames, for its links. */
export async function mentionedIn(body: string): Promise<string[]> {
  if (parseMentions(body).length === 0) return [];
  const [supabase, hidden] = await Promise.all([createClient(), hiddenPeople()]);
  return namedIn(body, await realNames(supabase, [body], hidden));
}

/**
 * Whether the signed-in person may reply here: "open", "locked" (a take on
 * today's Versus before they've picked) or "gone" (deleted, no words, or its
 * writer hidden from them, which isn't said).
 */
export async function replyable(kind: ThreadKind, id: number): Promise<"open" | "locked" | "gone"> {
  const [supabase, user, hidden] = await Promise.all([
    createClient(),
    getCurrentUser(),
    hiddenPeople(),
  ]);
  const found = await readHead(supabase, kind, id, user?.id ?? null);
  if (!found) return "gone";
  // Hidden writers are gone before anything else, so a lock never says one exists.
  if (hidden.has(found.ownerId)) return "gone";
  return "locked" in found ? "locked" : "open";
}

async function readThread(kind: ThreadKind, id: number): Promise<ThreadPage> {
  const [supabase, user, hidden] = await Promise.all([
    createClient(),
    getCurrentUser(),
    hiddenPeople(),
  ]);
  const userId = user?.id ?? null;
  const found = await readHead(supabase, kind, id, userId);
  if (!found) return GONE;
  // Hidden writers are gone before anything else, so a lock never says one exists.
  if (hidden.has(found.ownerId)) return GONE;
  if ("locked" in found) return { state: "locked", day: found.locked };

  const [reactions, read] = await Promise.all([
    getReactions(kind, [id]),
    userId ? readReplies(supabase, kind, id) : Promise.resolve({ rows: [], available: true }),
  ]);
  const rows = read.rows.filter((row) => !hidden.has(row.user_id));
  const names = await realNames(
    supabase,
    rows.map((row) => row.body),
    hidden,
  );

  const replies: Reply[] = rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: row.profiles,
    mentions: namedIn(row.body, names),
    mine: row.user_id === userId,
    canDelete: userId !== null && (row.user_id === userId || found.ownerId === userId),
  }));

  const reaction = reactions[id] ?? NO_REACTIONS;
  const head: ThreadHead =
    found.head.kind === "take"
      ? {
          ...found.head,
          take: { ...found.head.take, reactions: reaction, replies: replies.length },
        }
      : { ...found.head, reaction };

  return {
    state: "open",
    head,
    replies,
    canReply: userId !== null && read.available,
    available: read.available,
  };
}

/**
 * A review or take with its replies, as its thread page shows them. Kept for
 * the request, so a page's title and body read it once.
 */
export const getThread = cache(readThread);
