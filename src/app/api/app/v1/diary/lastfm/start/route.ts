import type { LastfmStartResult } from "@/lib/app-api";
import { appError, appJson, appRoute, signedInCaller } from "@/lib/app-route";
import { callbackOrigin } from "@/lib/auth";
import { approvalUrl, createConnectState, LASTFM_OFF, lastfmKeys } from "@/lib/diary/lastfm";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

/**
 * Connect Last.fm from the app: Last.fm's approval page for the browser
 * sheet. Last.fm comes back to the website's callback, which saves the
 * account and returns to mulo://diary/lastfm. The callback is built as the
 * sign-in emails' is, never from the request. `to=app` only says where a
 * failure goes when the state can't be read; the state alone says whose
 * account it is and whether it worked.
 */
export const POST = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const keys = lastfmKeys();
  if (!keys) return appError(503, LASTFM_OFF);
  const state = await createConnectState(user.id, "app");
  const callback = `${callbackOrigin()}/diary/lastfm/callback?state=${state}&to=app`;
  return appJson<LastfmStartResult>({ ok: true, url: approvalUrl(keys, callback) });
});
