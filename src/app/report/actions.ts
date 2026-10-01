"use server";

import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { field, firstError, rowIdText, textSchema, userIdSchema } from "@/lib/validation";

export type ReportState = { error?: string; message?: string };

/** The report form sends every target field, empty except for the one it's about. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal("").transform(() => undefined), schema]);

const reportInput = z
  .object({
    reason: z.enum(REPORT_REASONS, "Please choose a reason."),
    detail: textSchema(500, "Keep the detail to 500 characters."),
    rating_id: optional(rowIdText),
    artist_rating_id: optional(rowIdText),
    profile_id: optional(userIdSchema),
    versus_take_id: optional(rowIdText),
    list_id: optional(rowIdText),
  })
  .refine(
    ({ rating_id, artist_rating_id, profile_id, versus_take_id, list_id }) =>
      [rating_id, artist_rating_id, profile_id, versus_take_id, list_id].filter(
        (target) => target !== undefined,
      ).length === 1,
    "Couldn't send that report. Please try again.",
  );

export async function submitReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Log in to report something." };

  const input = reportInput.safeParse({
    reason: field(formData, "reason"),
    detail: field(formData, "detail"),
    rating_id: field(formData, "rating_id"),
    artist_rating_id: field(formData, "artist_rating_id"),
    profile_id: field(formData, "profile_id"),
    versus_take_id: field(formData, "versus_take_id"),
    list_id: field(formData, "list_id"),
  });
  if (!input.success) return { error: firstError(input.error) };
  const report = input.data;

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_rating_id: report.rating_id ?? null,
    reported_artist_rating_id: report.artist_rating_id ?? null,
    reported_profile_id: report.profile_id ?? null,
    // Only sent for takes and lists, so other reports still work on a
    // database without those columns.
    ...(report.versus_take_id ? { reported_versus_take_id: report.versus_take_id } : {}),
    ...(report.list_id ? { reported_list_id: report.list_id } : {}),
    reason: report.reason,
    detail: report.detail || null,
  });

  if (error) {
    // Unique violation: they have already reported this item.
    if (error.code === "23505") {
      return { message: "You've already reported this. Thanks — we have it." };
    }
    console.error("[report] insert failed:", error.code, error.message);
    return { error: "Couldn't send that report. Please try again." };
  }

  return {
    message: "Thanks for the report. We'll take a look.",
  };
}
