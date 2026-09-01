"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RatingState = {
  error?: string;
  message?: string;
  /** Set after a successful removal so the form can clear its selection. */
  cleared?: boolean;
};

/**
 * Handles both saving and removing, chosen by the `intent` field on the
 * submit button, so the form only ever has one piece of result state to
 * show. Two separate actions meant a stale "saved" message could linger
 * after a removal.
 */
export async function submitRating(
  _prev: RatingState,
  formData: FormData,
): Promise<RatingState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const releaseMbid = String(formData.get("release_mbid") ?? "");
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "remove") {
    const { error } = await supabase
      .from("ratings")
      .delete()
      .eq("user_id", user.id)
      .eq("release_mbid", releaseMbid);

    if (error) return { error: error.message };

    revalidatePath(`/album/${releaseMbid}`);
    revalidatePath("/ratings");
    return { message: "Rating removed.", cleared: true };
  }

  const score = Number(formData.get("score"));
  const review = String(formData.get("review") ?? "").trim();

  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return { error: "Pick a score from 1 to 10 before saving." };
  }

  const { error } = await supabase.from("ratings").upsert(
    {
      user_id: user.id,
      release_mbid: releaseMbid,
      score,
      review: review || null,
    },
    { onConflict: "user_id,release_mbid" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/album/${releaseMbid}`);
  revalidatePath("/ratings");
  return { message: "Rating saved." };
}
