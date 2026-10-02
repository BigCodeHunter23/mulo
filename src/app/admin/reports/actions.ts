"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/moderation";
import { rowIdSchema } from "@/lib/validation";

const statusSchema = z.enum(["open", "reviewed", "dismissed"]);
type Status = z.infer<typeof statusSchema>;

/**
 * Every moderation decision goes in the server log, so there is a record of
 * who removed what. Failures are logged too: these run from plain forms, so
 * there is nobody waiting on the page to tell.
 */
function record(
  admin: { id: string; email: string | null },
  action: string,
  error: { message: string } | null,
) {
  if (error) console.error(`[admin] ${action} failed for ${admin.email}:`, error.message);
  else console.info(`[admin] ${admin.email} (${admin.id}) ${action}`);
}

/** Every action checks again: a server action can be called directly. */
export async function setReportStatus(reportId: number, status: Status) {
  const admin = await requireAdmin();
  if (!admin) return;
  if (!rowIdSchema.safeParse(reportId).success || !statusSchema.safeParse(status).success) return;

  const { error } = await createAdminClient().from("reports").update({ status }).eq("id", reportId);
  record(admin, `set report ${reportId} to ${status}`, error);
  revalidatePath("/admin/reports");
}

/**
 * Takes a review's words down but keeps the score, then closes any open
 * reports about it.
 */
export async function removeReview(kind: "album" | "artist", ratingId: number) {
  const admin = await requireAdmin();
  if (!admin) return;
  if (
    !z.enum(["album", "artist"]).safeParse(kind).success ||
    !rowIdSchema.safeParse(ratingId).success
  ) {
    return;
  }

  const db = createAdminClient();
  const table = kind === "album" ? "ratings" : "artist_ratings";
  const column = kind === "album" ? "reported_rating_id" : "reported_artist_rating_id";

  const { error } = await db.from(table).update({ review: null }).eq("id", ratingId);
  record(admin, `removed the review on ${kind} rating ${ratingId}`, error);
  if (!error) {
    await db
      .from("reports")
      .update({ status: "reviewed" })
      .eq(column, ratingId)
      .eq("status", "open");
  }

  revalidatePath("/admin/reports");
}

/** A reported list goes entirely: its title and notes are the whole of it. */
export async function removeList(listId: number) {
  const admin = await requireAdmin();
  if (!admin) return;
  if (!rowIdSchema.safeParse(listId).success) return;

  const { error } = await createAdminClient().from("lists").delete().eq("id", listId);
  record(admin, `removed list ${listId}`, error);
  revalidatePath("/admin/reports");
  revalidatePath("/lists", "layout");
}

/**
 * Deletes a take on the Daily Versus. Its reports go with it, since there is
 * nothing left to look at.
 */
export async function removeTake(takeId: number) {
  const admin = await requireAdmin();
  if (!admin) return;
  if (!rowIdSchema.safeParse(takeId).success) return;

  const { error } = await createAdminClient().from("versus_takes").delete().eq("id", takeId);
  record(admin, `removed take ${takeId}`, error);
  revalidatePath("/admin/reports");
  revalidatePath("/versus", "layout");
}
