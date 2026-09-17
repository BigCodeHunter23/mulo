"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

export type ReportState = { error?: string; message?: string };

export async function submitReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();
  const ratingId = formData.get("rating_id");
  const artistRatingId = formData.get("artist_rating_id");
  const profileId = formData.get("profile_id");
  const takeId = formData.get("versus_take_id");

  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return { error: "Please choose a reason." };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_rating_id: ratingId ? Number(ratingId) : null,
    reported_artist_rating_id: artistRatingId ? Number(artistRatingId) : null,
    reported_profile_id: profileId ? String(profileId) : null,
    // Only sent for takes, so other reports still work before takes exist.
    ...(takeId ? { reported_versus_take_id: Number(takeId) } : {}),
    reason,
    detail: detail || null,
  });

  if (error) {
    // Unique violation: they have already reported this item.
    if (error.code === "23505") {
      return { message: "You've already reported this. Thanks — we have it." };
    }
    return { error: error.message };
  }

  return {
    message: "Thanks for the report. We'll take a look.",
  };
}
