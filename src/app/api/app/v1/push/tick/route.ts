import type { NextRequest } from "next/server";
import { appError, appJson, appRoute } from "@/lib/app-route";
import { runDiaryTick } from "@/lib/diary/tick";
import { runTick } from "@/lib/push/tick";
import { tickAllowed } from "@/lib/push/tick-auth";

/** Long enough for a run that sends to a few thousand phones. */
export const maxDuration = 60;

/**
 * The diary starts no new work this long after the clock started, leaving
 * room inside maxDuration for a Last.fm page asked for just before (ten
 * seconds at most) to be read and saved…
 */
const DIARY_UNTIL_MS = 45_000;
/** …though it always has this long after the pushes, when they ran late… */
const DIARY_SLICE_MS = 12_000;
/** …and never past this. */
const DIARY_LAST_MS = 55_000;

/**
 * The clock: Supabase calls this every 15 minutes with the shared secret
 * (supabase/setup/push-clock.sql). Anyone else gets a 401. It sends the
 * pushes, then moves the diary on: matching names to albums, and Last.fm
 * imports and syncs. Pushes that fail are logged, and the diary still runs.
 */
export const POST = appRoute(async (request: NextRequest) => {
  if (!tickAllowed(request.headers.get("authorization"))) return appError(401, "Not allowed.");
  const started = Date.now();
  let pushes: object;
  try {
    pushes = await runTick();
  } catch (error) {
    console.error("[clock] the pushes failed:", error);
    pushes = { pushes: "failed" };
  }
  const deadline = Math.min(
    started + DIARY_LAST_MS,
    Math.max(started + DIARY_UNTIL_MS, Date.now() + DIARY_SLICE_MS),
  );
  const diary = await runDiaryTick(new Date(), deadline);
  return appJson({ ...pushes, diary });
});
