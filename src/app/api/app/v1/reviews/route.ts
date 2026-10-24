import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveReview } from "@/app/ratings/actions";
import type { RatingResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `saveReview` checks the values, as it does for the website. */
const reviewBody = z.object({
  kind: z.enum(["album", "artist"]),
  mbid: z.string(),
  review: z.string(),
});

/** Saves the words beside a score; an empty review clears it, as on the website. */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, reviewBody);
  if (body instanceof Response) return body;

  return appJson<RatingResult>(await saveReview(body.kind, body.mbid, body.review));
});
