import "server-only";
import { hiddenPeople } from "@/lib/blocks";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { ReactionSummary } from "@/lib/app-api";

export type { ReactionSummary };

export type ReactionKind = "album" | "artist" | "take" | "pick";

/** Which column points at which kind of rating, or at a Versus take or pick. */
export const REACTION_COLUMNS = {
  album: "rating_id",
  artist: "artist_rating_id",
  take: "versus_take_id",
  pick: "versus_vote_id",
} as const satisfies Record<ReactionKind, string>;

export const NO_REACTIONS: ReactionSummary = { love: 0, dislike: 0, mine: null };

/**
 * Loves and dislikes for a page of reviews, in one query. Somebody blocked,
 * either way round, doesn't count.
 */
export async function getReactions(
  kind: ReactionKind,
  ratingIds: number[],
): Promise<Record<number, ReactionSummary>> {
  const summaries: Record<number, ReactionSummary> = {};
  if (ratingIds.length === 0) return summaries;

  for (const id of ratingIds) summaries[id] = { ...NO_REACTIONS };

  const supabase = await createClient();
  const [user, hidden] = await Promise.all([getCurrentUser(), hiddenPeople()]);
  const column = REACTION_COLUMNS[kind];

  const { data } = await supabase
    .from("reactions")
    .select(`user_id, value, ${column}`)
    .in(column, ratingIds);

  // The column changes with the kind, which the typed query builder can't
  // follow, so the row's shape is spelled out here.
  for (const row of (data ?? []) as unknown as ({
    user_id: string;
    value: number;
  } & Partial<Record<(typeof REACTION_COLUMNS)[ReactionKind], number>>)[]) {
    if (hidden.has(row.user_id)) continue;
    const id = row[column];
    const summary = id === undefined ? undefined : summaries[id];
    if (!summary) continue;

    if (row.value === 1) summary.love += 1;
    else summary.dislike += 1;

    if (user && row.user_id === user.id) summary.mine = row.value === 1 ? 1 : -1;
  }

  return summaries;
}
