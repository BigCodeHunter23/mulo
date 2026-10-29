"use server";

import { z } from "zod";
import type { ReplyResult, SaveResult } from "@/lib/app-api";
import { isRespectful, NOT_RESPECTFUL } from "@/lib/content-filter";
import { notifyReply, recordMentions } from "@/lib/push/events";
import { later } from "@/lib/push/later";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import { mentionedIn, NOT_YET, PICK_FIRST, REPLY_COLUMNS, replyable } from "@/lib/replies";
import { REPLY_LIMIT, THREAD_GONE, withoutFormatting, type ThreadKind } from "@/lib/replies-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { isMissingTable } from "@/lib/supabase/errors";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { rowIdSchema } from "@/lib/validation";

const target = z.object({
  kind: z.enum(["album", "artist", "take"]),
  targetId: rowIdSchema,
});

const TRY_AGAIN = "Couldn't save that. Please try again.";
const TOO_LONG = `Keep it to ${REPLY_LIMIT.toLocaleString("en")} characters.`;

/** The most replies one person may post in one thread. */
const PER_THREAD_MAX = 50;

type DbError = { code?: string; message?: string; details?: string | null };

/** What the database's refusal means, in plain words. */
function refusal(error: DbError | null): string {
  if (isMissingTable(error)) return NOT_YET;
  const said = `${error?.details ?? ""} ${error?.message ?? ""}`;
  if (error?.code === "23503" && said.includes("profiles")) {
    return "Pick a username first, then come back.";
  }
  // The review lost its words, or the review or take went, a moment ago.
  if (error?.code === "23503") return THREAD_GONE;
  if (error?.code === "23514") {
    return said.includes("replies_thread_has_owner") ? THREAD_GONE : TOO_LONG;
  }
  return TRY_AGAIN;
}

/**
 * Answers a written review or a take. Every check is made here, then the
 * reply is written with the service role, as the signed-in person: nobody
 * may write to `replies` themselves (migration 0024), so the rate limit, the
 * word filter, a block either way and the pick-first lock always apply.
 * `replyable` reads the thread through the visitor's own session and calls
 * it gone when its writer is hidden either way, which is the block check.
 *
 * The thread pages are read fresh on every visit (they depend on who's
 * looking), so there's nothing to revalidate; the website's box refreshes
 * its page itself.
 */
export async function postReply(
  kind: ThreadKind,
  targetId: number,
  body: string,
): Promise<ReplyResult> {
  try {
    return await post(kind, targetId, body);
  } catch (error) {
    // Nothing thrown here may reach the page; say "try again" instead.
    console.error("[replies] post failed:", error);
    return { ok: false, error: TRY_AGAIN };
  }
}

async function post(kind: ThreadKind, targetId: number, body: string): Promise<ReplyResult> {
  if (!target.safeParse({ kind, targetId }).success || typeof body !== "string") {
    return { ok: false, error: TRY_AGAIN };
  }
  const text = withoutFormatting(body).trim();
  if (text.length === 0) return { ok: false, error: "Say something first." };
  if (text.length > REPLY_LIMIT) return { ok: false, error: TOO_LONG };
  if (!isRespectful(text)) return { ok: false, error: NOT_RESPECTFUL };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to reply." };
  if (!(await allowUser("post", user.id))) return { ok: false, error: TOO_MANY };

  const state = await replyable(kind, targetId);
  if (state !== "open") return { ok: false, error: state === "locked" ? PICK_FIRST : THREAD_GONE };

  const column = REPLY_COLUMNS[kind];
  const server = createAdminClient();
  const { count, error: countError } = await server
    .from("replies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq(column, targetId);
  if (countError) return { ok: false, error: refusal(countError) };
  // The count and the insert aren't atomic, so a burst could pass the cap; the rate limit bounds it.
  if ((count ?? 0) >= PER_THREAD_MAX) {
    return { ok: false, error: "That's the most replies you can post here." };
  }

  // The owner of the thread is filled in by the database (replies_thread_owner).
  const row: TablesInsert<"replies"> = { user_id: user.id, body: text };
  row[column] = targetId;

  const { data, error } = await server
    .from("replies")
    .insert(row)
    .select("id, body, created_at, profiles!inner ( id, username, display_name, avatar_url )")
    .single();
  if (error || !data) return { ok: false, error: refusal(error) };

  const event = { kind, targetId, replierId: user.id, body: text };
  later(() => notifyReply(event));

  // The reply is saved: a failed name lookup only costs its links, and a
  // failure keeping who it names only its bell lines, never a "try again"
  // that would post it twice.
  const [mentions] = await Promise.all([
    mentionedIn(text).catch(() => []),
    recordMentions(data.id, event),
  ]);

  return {
    ok: true,
    reply: {
      id: data.id,
      body: data.body,
      createdAt: data.created_at,
      author: data.profiles,
      mentions,
      mine: true,
      canDelete: true,
    },
  };
}

/**
 * Deletes a reply for good: your own, or any on your own review or take.
 * Row-level security decides; a reply that wasn't yours to delete is left
 * alone and said so.
 */
export async function deleteReply(replyId: number): Promise<SaveResult> {
  try {
    return await remove(replyId);
  } catch (error) {
    console.error("[replies] delete failed:", error);
    return { ok: false, error: TRY_AGAIN };
  }
}

async function remove(replyId: number): Promise<SaveResult> {
  if (!rowIdSchema.safeParse(replyId).success) return { ok: false, error: TRY_AGAIN };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first." };
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.from("replies").delete().eq("id", replyId).select("id");
  if (error) return { ok: false, error: TRY_AGAIN };
  if (!data || data.length === 0) return { ok: false, error: "Couldn't delete that reply." };
  return { ok: true };
}
