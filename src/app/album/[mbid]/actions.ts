"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type RatingResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      needsLogin?: boolean;
      needsProfile?: boolean;
    };

type DbError = { code?: string; message: string; details?: string | null };

function failure(error: DbError): RatingResult {
  // Ratings belong to a profile, so an account without a username yet can't
  // save one. Say so plainly rather than showing a database error.
  if (
    error.code === "23503" &&
    `${error.details ?? ""} ${error.message}`.includes("profiles")
  ) {
    return {
      ok: false,
      error: "Pick a username before rating.",
      needsProfile: true,
    };
  }
  return { ok: false, error: "Couldn't save that. Please try again." };
}

function refresh(releaseMbid: string) {
  revalidatePath(`/album/${releaseMbid}`);
  revalidatePath("/ratings");
}

/** Saves a score the moment it's tapped. Leaves any existing review alone. */
export async function rateAlbum(
  releaseMbid: string,
  score: number,
): Promise<RatingResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to rate albums.", needsLogin: true };
  }

  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return { ok: false, error: "Scores run from 1 to 10." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .upsert(
      { user_id: user.id, release_mbid: releaseMbid, score },
      { onConflict: "user_id,release_mbid" },
    );

  if (error) return failure(error);

  refresh(releaseMbid);
  return { ok: true };
}

/** A review hangs off a rating, so there has to be a score first. */
export async function saveReview(
  releaseMbid: string,
  review: string,
): Promise<RatingResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to write a review.", needsLogin: true };
  }

  const text = review.trim().slice(0, 1000);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .update({ review: text || null })
    .eq("user_id", user.id)
    .eq("release_mbid", releaseMbid)
    .select("id");

  if (error) return failure(error);
  if (!data || data.length === 0) {
    return { ok: false, error: "Pick a score first, then add your review." };
  }

  refresh(releaseMbid);
  return { ok: true };
}

export async function removeRating(releaseMbid: string): Promise<RatingResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first.", needsLogin: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .delete()
    .eq("user_id", user.id)
    .eq("release_mbid", releaseMbid);

  if (error) return failure(error);

  refresh(releaseMbid);
  return { ok: true };
}
