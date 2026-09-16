"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { REACTION_COLUMNS, type ReactionKind } from "@/lib/reactions";

export type ReactionResult = { ok: true } | { ok: false; error: string };

const TRY_AGAIN: ReactionResult = {
  ok: false,
  error: "Couldn't save that. Please try again.",
};

/**
 * Love or dislike somebody else's rating; the same choice again takes it back.
 * One reaction per person per rating, so the old one goes before the new one
 * lands. No upsert here: the uniqueness rule is a partial index, which
 * PostgREST cannot aim an upsert at.
 */
export async function setReaction(
  kind: ReactionKind,
  ratingId: number,
  value: 1 | -1 | 0,
): Promise<ReactionResult> {
  if (!Object.hasOwn(REACTION_COLUMNS, kind)) return TRY_AGAIN;
  if (!Number.isInteger(ratingId) || ratingId < 1) return TRY_AGAIN;
  if (value !== 1 && value !== -1 && value !== 0) return TRY_AGAIN;

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to react to a review." };
  }

  const column = REACTION_COLUMNS[kind];
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("reactions")
    .delete()
    .eq("user_id", user.id)
    .eq(column, ratingId);
  if (clearError) return TRY_AGAIN;

  if (value !== 0) {
    const { error } = await supabase
      .from("reactions")
      .insert({ user_id: user.id, [column]: ratingId, value });
    if (error) return TRY_AGAIN;
  }

  return { ok: true };
}
