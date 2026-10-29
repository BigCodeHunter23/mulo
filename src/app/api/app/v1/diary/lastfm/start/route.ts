import type { NextRequest } from "next/server";
import type { LastfmStartResult } from "@/lib/app-api";
import { appError, appJson, appRoute, signedInCaller } from "@/lib/app-route";
import { approvalUrl, createConnectState, LASTFM_OFF, lastfmKeys } from "@/lib/diary/lastfm";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

/**
 * Connect Last.fm from the app: Last.fm's approval page for the browser
 * sheet. Last.fm comes back to the website's callback, which saves the
 * account and returns to mulo://diary/lastfm. The callback is on whichever
 * website the app asked, so a website running on this computer works too;
 * the state ties it to the caller, so the address only ever sends them.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const keys = lastfmKeys();
  if (!keys) return appError(503, LASTFM_OFF);
  const state = await createConnectState(user.id, "app");
  const callback = `${request.nextUrl.origin}/diary/lastfm/callback?state=${state}`;
  return appJson<LastfmStartResult>({ ok: true, url: approvalUrl(keys, callback) });
});
