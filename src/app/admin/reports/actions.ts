"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/moderation";

const STATUSES = ["open", "reviewed", "dismissed"] as const;
type Status = (typeof STATUSES)[number];

/** Every action checks again: a server action can be called directly. */
export async function setReportStatus(reportId: number, status: Status) {
  if (!(await requireAdmin())) return;
  if (!Number.isInteger(reportId) || !STATUSES.includes(status)) return;

  await createAdminClient().from("reports").update({ status }).eq("id", reportId);
  revalidatePath("/admin/reports");
}

/**
 * Takes a review's words down but keeps the score, then closes any open
 * reports about it.
 */
export async function removeReview(kind: "album" | "artist", ratingId: number) {
  if (!(await requireAdmin())) return;
  if ((kind !== "album" && kind !== "artist") || !Number.isInteger(ratingId)) return;

  const admin = createAdminClient();
  const table = kind === "album" ? "ratings" : "artist_ratings";
  const column = kind === "album" ? "reported_rating_id" : "reported_artist_rating_id";

  await admin.from(table).update({ review: null }).eq("id", ratingId);
  await admin
    .from("reports")
    .update({ status: "reviewed" })
    .eq(column, ratingId)
    .eq("status", "open");

  revalidatePath("/admin/reports");
}
