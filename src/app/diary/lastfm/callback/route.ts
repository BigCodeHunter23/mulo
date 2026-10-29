import { NextResponse, type NextRequest } from "next/server";
import { callbackOrigin } from "@/lib/auth";
import {
  CONNECT_COOKIE,
  CONNECT_COOKIE_PATH,
  lastfmKeys,
  sameBrowser,
  saveConnection,
  sessionFor,
  takeConnectState,
  type ConnectStarted,
} from "@/lib/diary/lastfm";

const APP_BACK = "mulo://diary/lastfm";

/**
 * Last.fm sends people back here with `token` after they approve MULO, and
 * the `state` this connect started with, which says who they are and whether
 * they came from the website or the app. A state works once, for ten minutes.
 * One started on the website also needs the cookie set in the browser that
 * started it, so a link can't connect somebody else's Last.fm; the app's
 * browser sheet has no cookies, so its connects rely on the state alone.
 *
 * The app's address also carries `to=app`. It only sends a failure back to
 * the app when the state can't be read, so the browser sheet closes; whose
 * account it is, and whether it worked, come from the state alone. The
 * website's own address is built as the sign-in emails' is, never from the
 * request.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const state = query.get("state") ?? "";
  const token = query.get("token") ?? "";
  const web = (outcome: "connected" | "failed") => {
    const response = NextResponse.redirect(new URL(`/diary?lastfm=${outcome}`, callbackOrigin()));
    response.cookies.set(CONNECT_COOKIE, "", { path: CONNECT_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const appFailed = () => NextResponse.redirect(`${APP_BACK}?error=1`);
  const failed = (to: "web" | "app" | undefined) =>
    (to ?? (query.get("to") === "app" ? "app" : "web")) === "app" ? appFailed() : web("failed");

  const keys = lastfmKeys();
  if (!keys || !state || !token) return failed(undefined);

  let started: ConnectStarted | null = null;
  try {
    started = await takeConnectState(state);
    if (!started) return failed(undefined);
    if (started.to === "web" && !sameBrowser(request.cookies.get(CONNECT_COOKIE)?.value, state)) {
      return web("failed");
    }
    const session = await sessionFor(token, keys);
    await saveConnection(started.userId, session, started.timeZone);
  } catch (error) {
    console.error(
      "[diary] connecting Last.fm failed:",
      error instanceof Error ? error.message : error,
    );
    return failed(started?.to);
  }
  return started.to === "app" ? NextResponse.redirect(`${APP_BACK}?ok=1`) : web("connected");
}
