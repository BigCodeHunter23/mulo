import { NextResponse, type NextRequest } from "next/server";
import { lastfmKeys, saveConnection, sessionFor, takeConnectState } from "@/lib/diary/lastfm";

const APP_BACK = "mulo://diary/lastfm";

/**
 * Last.fm sends people back here with `token` after they approve MULO, and
 * the `state` this connect started with, which says who they are and whether
 * they came from the website or the app. A state works once, for ten minutes,
 * so no cookie is needed: the app's browser sheet has none.
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const web = (outcome: "connected" | "failed") =>
    NextResponse.redirect(new URL(`/diary?lastfm=${outcome}`, request.nextUrl.origin));

  const keys = lastfmKeys();
  const started = keys && state && token ? await takeConnectState(state) : null;
  if (!keys || !started) return web("failed");

  try {
    const session = await sessionFor(token, keys);
    await saveConnection(started.userId, session);
  } catch (error) {
    console.error(
      "[diary] connecting Last.fm failed:",
      error instanceof Error ? error.message : error,
    );
    return started.to === "app" ? NextResponse.redirect(`${APP_BACK}?error=1`) : web("failed");
  }
  return started.to === "app" ? NextResponse.redirect(`${APP_BACK}?ok=1`) : web("connected");
}
