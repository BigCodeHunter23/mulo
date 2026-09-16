"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPick, getTally } from "@/lib/versus";
import type { VersusSideKey, VersusTally } from "@/lib/versus-shared";

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
