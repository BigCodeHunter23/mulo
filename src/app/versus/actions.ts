"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPick, getTally } from "@/lib/versus";
import { TAKE_LIMIT, type VersusSideKey, type VersusTally } from "@/lib/versus-shared";

export type PickResult =
  | { ok: true; mine: VersusSideKey; tally: VersusTally }
  | { ok: false; error: string; mine?: VersusSideKey; tally?: VersusTally };

const TRY_AGAIN = "Couldn't save that. Please try again.";

/** One pick each, and only in today's matchup: the database holds both rules. */
export async function castVote(
  matchupId: number,
  pick: VersusSideKey,
): Promise<PickResult> {
  if (!Number.isSafeInteger(matchupId) || (pick !== "left" && pick !== "right")) {
    return { ok: false, error: TRY_AGAIN };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to pick." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("versus_votes")
    .insert({ matchup_id: matchupId, user_id: user.id, pick });

  if (error) {
    // Already picked, perhaps in another tab: show what they chose, and the split.
    if (error.code === "23505") {
      const mine = await getPick(matchupId, user.id);
      return mine
        ? {
            ok: false,
            error: "You already picked in this one.",
            mine,
            tally: await getTally(matchupId, user.id),
          }
        : { ok: false, error: TRY_AGAIN };
    }
    if (error.code === "23503") {
      return { ok: false, error: "Pick a username first, then come back." };
    }
    // Turned away because the matchup isn't today's any more.
    if (error.code === "42501") {
      return { ok: false, error: "This one has closed. Refresh for today's." };
    }
    return { ok: false, error: TRY_AGAIN };
  }

  revalidatePath("/versus", "layout");
  return { ok: true, mine: pick, tally: await getTally(matchupId, user.id) };
}

export type TakeResult = { ok: true } | { ok: false; error: string };

/** Your case for the side you picked: one take each, and only once you've picked. */
export async function postTake(matchupId: number, body: string): Promise<TakeResult> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!Number.isSafeInteger(matchupId)) return { ok: false, error: TRY_AGAIN };
  if (text.length === 0) return { ok: false, error: "Say something first." };
  if (text.length > TAKE_LIMIT) {
    return { ok: false, error: `Keep it to ${TAKE_LIMIT} characters.` };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to post a take." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("versus_takes")
    .insert({ matchup_id: matchupId, user_id: user.id, body: text });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You've already had your say on this one." };
    }
    // The database only takes a take from somebody who picked a side.
    if (error.code === "42501") {
      return { ok: false, error: "Pick a side first, then make your case." };
    }
    return { ok: false, error: TRY_AGAIN };
  }

  revalidatePath("/versus", "layout");
  return { ok: true };
}

export async function deleteTake(takeId: number): Promise<TakeResult> {
  if (!Number.isSafeInteger(takeId)) return { ok: false, error: TRY_AGAIN };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("versus_takes")
    .delete()
    .eq("id", takeId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: TRY_AGAIN };

  revalidatePath("/versus", "layout");
  return { ok: true };
}

export type NominationResult = { ok: true } | { ok: false; error: string };

const ARTIST_MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Puts a matchup forward. The pair is stored with the lower id on the left,
 * so either order finds the same nomination; one that already exists just
 * gets backed.
 */
export async function nominateMatchup(a: string, b: string): Promise<NominationResult> {
  if (!ARTIST_MBID.test(a) || !ARTIST_MBID.test(b)) return { ok: false, error: TRY_AGAIN };
  const [left, right] = [a.toLowerCase(), b.toLowerCase()].sort();
  if (left === right) return { ok: false, error: "Pick two different artists." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to nominate." };

  const supabase = await createClient();
  let { data: existing } = await supabase
    .from("versus_nominations")
    .select("id")
    .eq("left_artist_mbid", left)
    .eq("right_artist_mbid", right)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await supabase
      .from("versus_nominations")
      .insert({ left_artist_mbid: left, right_artist_mbid: right, nominated_by: user.id })
      .select("id")
      .single();
    if (error?.code === "23505") {
      // Somebody nominated it a moment ago.
      ({ data: existing } = await supabase
        .from("versus_nominations")
        .select("id")
        .eq("left_artist_mbid", left)
        .eq("right_artist_mbid", right)
        .maybeSingle());
    } else if (error || !data) {
      return {
        ok: false,
        error: error?.code === "23503" ? "Pick a username first, then come back." : TRY_AGAIN,
      };
    } else {
      existing = data;
    }
  }
  if (!existing) return { ok: false, error: TRY_AGAIN };

  const { error } = await supabase
    .from("versus_nomination_backers")
    .insert({ nomination_id: existing.id, user_id: user.id });
  if (error && error.code !== "23505") return { ok: false, error: TRY_AGAIN };

  revalidatePath("/versus", "layout");
  return { ok: true };
}

/** Backs a nomination, or takes the backing back. */
export async function backNomination(id: number, back: boolean): Promise<NominationResult> {
  if (!Number.isSafeInteger(id)) return { ok: false, error: TRY_AGAIN };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to back a matchup." };

  const supabase = await createClient();
  const { error } = back
    ? await supabase.from("versus_nomination_backers").insert({ nomination_id: id, user_id: user.id })
    : await supabase
        .from("versus_nomination_backers")
        .delete()
        .eq("nomination_id", id)
        .eq("user_id", user.id);
  if (error && error.code !== "23505") return { ok: false, error: TRY_AGAIN };

  revalidatePath("/versus", "layout");
  return { ok: true };
}
