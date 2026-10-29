import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { logListen } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

const listen = z.object({
  mbid: z.string().max(40),
  day: z.string().max(10),
  score: z.number().int().min(1).max(10).optional(),
});

/**
 * Log a listen: an album on a day, with a score if one's given. The score is
 * saved by the website's own rating action, which rates as whoever is signed
 * in, so this only ever logs for the caller.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const body = await readBody(request, listen);
  if (body instanceof Response) return body;
  return appJson<SaveResult>(await logListen(user.id, body));
});
