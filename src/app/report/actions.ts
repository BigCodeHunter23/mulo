"use server";

import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
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
    reply_id: optional(rowIdText),
  })
  .refine(
    ({ rating_id, artist_rating_id, profile_id, versus_take_id, list_id, reply_id }) =>
      [rating_id, artist_rating_id, profile_id, versus_take_id, list_id, reply_id].filter(
        (target) => target !== undefined,
      ).length === 1,
    "Couldn't send that report. Please try again.",
  );

const NOT_SENT = "Couldn't send that report. Please try again.";

/** How much of a reported reply is kept with the report. */
const REPLY_KEPT = 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What a report of a reply says: the reporter's own words, then "Reply: "
 * and the reply's first 1,000 characters, so the report carries the words
 * it's about. Read through the reporter's own session, so a reply hidden
 * from them (or gone) can't be reported: null.
 */
async function withReply(
  supabase: Supabase,
  replyId: number,
  detail: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("replies")
    .select("body")
    .eq("id", replyId)
    .maybeSingle();
  if (error || !data) return null;
  const words = `Reply: ${Array.from(data.body).slice(0, REPLY_KEPT).join("")}`;
  return detail ? `${detail}\n\n${words}` : words;
}

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
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
    reply_id: field(formData, "reply_id"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowUser("report", user.id))) return { error: TOO_MANY };
  const report = input.data;

  const supabase = await createClient();
  let detail = report.detail || null;
  if (report.reply_id) {
    detail = await withReply(supabase, report.reply_id, report.detail);
    if (detail === null) return { error: NOT_SENT };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_rating_id: report.rating_id ?? null,
    reported_artist_rating_id: report.artist_rating_id ?? null,
    reported_profile_id: report.profile_id ?? null,
    // Only sent for takes, lists and replies, so other reports still work on a
    // database without those columns.
    ...(report.versus_take_id ? { reported_versus_take_id: report.versus_take_id } : {}),
    ...(report.list_id ? { reported_list_id: report.list_id } : {}),
    ...(report.reply_id ? { reported_reply_id: report.reply_id } : {}),
    reason: report.reason,
    detail,
  });

  if (error) {
    // Unique violation: they have already reported this item.
    if (error.code === "23505") {
      return { message: "You've already reported this. Thanks — we have it." };
    }
    console.error("[report] insert failed:", error.code, error.message);
    return { error: NOT_SENT };
  }

  return {
    message: "Thanks for the report. We'll take a look.",
  };
}
