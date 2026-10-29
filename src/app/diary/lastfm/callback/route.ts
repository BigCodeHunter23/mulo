import { NextResponse, type NextRequest } from "next/server";
import { lastfmKeys, saveConnection, sessionFor, takeConnectState } from "@/lib/diary/lastfm";

const APP_BACK = "mulo://diary/lastfm";

/**
 * Last.fm sends people back here with `token` after they approve MULO, and
 * the `state` this connect started with, which says who they are and whether
 * they came from the website or the app. A state works once, for ten minutes,
 * so no cookie is needed: the app's browser sheet has none.
 *
 * The app's address also carries `to=app`. It only sends a failure back to
 * the app when the state can't be read, so the browser sheet closes; whose
 * account it is, and whether it worked, come from the state alone.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const state = query.get("state") ?? "";
  const token = query.get("token") ?? "";
  const web = (outcome: "connected" | "failed") =>
    NextResponse.redirect(new URL(`/diary?lastfm=${outcome}`, request.nextUrl.origin));
  const appFailed = () => NextResponse.redirect(`${APP_BACK}?error=1`);

  const keys = lastfmKeys();
  const started = keys && state && token ? await takeConnectState(state) : null;
  if (!keys || !started) return query.get("to") === "app" ? appFailed() : web("failed");

  try {
    const session = await sessionFor(token, keys);
    await saveConnection(started.userId, session);
  } catch (error) {
    console.error(
      "[diary] connecting Last.fm failed:",
      error instanceof Error ? error.message : error,
    );
    return started.to === "app" ? appFailed() : web("failed");
  }
  return started.to === "app" ? NextResponse.redirect(`${APP_BACK}?ok=1`) : web("connected");
}
