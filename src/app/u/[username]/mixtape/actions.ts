"use server";

import { revalidatePath } from "next/cache";
import { getMixtape, MONTH_PATTERN, type RankOffKind } from "@/lib/mixtape";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type RankOffResult = { ok: true } | { ok: false; error: string };

/** Crowns the winner of a rank-off as somebody's album or track of the month. */
export async function saveRankOff(
  month: string,
  kind: RankOffKind,
  mbid: string,
): Promise<RankOffResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first." };
  if (!MONTH_PATTERN.test(month) || (kind !== "album" && kind !== "song")) {
    return { ok: false, error: "Couldn't save that. Please try again." };
  }

  // Only something that really is tied for the top can win.
  const tape = await getMixtape(user.id, month);
  const tie = kind === "album" ? tape.albumTie : tape.songTie;
  if (!tie?.contenders.some((pick) => pick.mbid === mbid)) {
    return { ok: false, error: "Your top scores changed. Refresh and try again." };
  }
  if (!tape.rankOffs) {
    return { ok: false, error: "Rank-offs aren't switched on yet. Try again soon." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("mixtape_picks")
    .upsert({ user_id: user.id, month, kind, mbid }, { onConflict: "user_id,month,kind" });

  if (error) return { ok: false, error: "Couldn't save that. Please try again." };

  revalidatePath("/u/[username]/mixtape/[month]", "page");
  return { ok: true };
}
