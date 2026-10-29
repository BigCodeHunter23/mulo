import type { NextRequest } from "next/server";
import { z } from "zod";
import type { LastfmStart, LastfmStartResult } from "@/lib/app-api";
import { appError, appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { callbackOrigin } from "@/lib/auth";
import {
  approvalUrl,
  createConnectState,
  LASTFM_OFF,
  lastfmKeys,
  noteTimeZone,
} from "@/lib/diary/lastfm";
import { canonicalZone, isTimeZone } from "@/lib/push/zones";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

const start: z.ZodType<LastfmStart> = z.object({
  timeZone: z.string().max(64).refine(isTimeZone).optional(),
});

/**
 * Connect Last.fm from the app: Last.fm's approval page for the browser
 * sheet. Last.fm comes back to the website's callback, which saves the
 * account and returns to mulo://diary/lastfm. The callback is built as the
 * sign-in emails' is, never from the request. `to=app` only says where a
 * failure goes when the state can't be read; the state alone says whose
 * account it is and whether it worked. The phone's time zone, when it sends
 * one, is the clock a new import reads days by.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const keys = lastfmKeys();
  if (!keys) return appError(503, LASTFM_OFF);
  // An app from before the time zone sends no body.
  const empty = (await request.clone().text()).trim() === "";
  const body = empty ? {} : await readBody(request, start);
  if (body instanceof Response) return body;
  const zone = canonicalZone(body.timeZone);
  const state = await createConnectState(user.id, "app", zone);
  await noteTimeZone(user.id, zone);
  const callback = `${callbackOrigin()}/diary/lastfm/callback?state=${state}&to=app`;
  return appJson<LastfmStartResult>({ ok: true, url: approvalUrl(keys, callback) });
});
