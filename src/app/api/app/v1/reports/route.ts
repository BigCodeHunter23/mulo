import type { NextRequest } from "next/server";
import { z } from "zod";
import { submitReport } from "@/app/report/actions";
import type { ReportResult, ReportTarget } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** Which of the report form's fields says what's being reported. */
const TARGET_FIELD = {
  rating: "rating_id",
  artistRating: "artist_rating_id",
  profile: "profile_id",
  take: "versus_take_id",
  list: "list_id",
} as const satisfies Record<ReportTarget["kind"], string>;

/** The shape only; `submitReport` checks the reason, the detail and the ids. */
const reportBody = z.object({
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["rating", "artistRating", "take", "list"]), id: z.number().int() }),
    z.object({ kind: z.literal("profile"), id: z.string().max(40) }),
  ]),
  reason: z.string().max(100),
  detail: z.string().max(2000).optional(),
});

const NOT_SENT = "Couldn't send that report. Please try again.";

/**
 * A report, sent through the website's own form action. Reporting the same
 * thing twice is thanked, not refused, as on the website.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, reportBody);
  if (body instanceof Response) return body;

  // The form sends every target field, empty except the one it's about.
  const form = new FormData();
  for (const field of Object.values(TARGET_FIELD)) form.set(field, "");
  form.set(TARGET_FIELD[body.target.kind], String(body.target.id));
  form.set("reason", body.reason);
  form.set("detail", body.detail ?? "");

  const result = await submitReport({}, form);
  return appJson<ReportResult>(
    result.message
      ? { ok: true, message: result.message }
      : { ok: false, error: result.error ?? NOT_SENT },
  );
});
