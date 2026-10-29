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
 * seconds at most) to be read and saved.
 */
const DIARY_UNTIL_MS = 45_000;

/**
 * The clock: Supabase calls this every 15 minutes with the shared secret
 * (supabase/setup/push-clock.sql). Anyone else gets a 401. It sends the
 * pushes, then moves the diary on: matching names to albums, and Last.fm
 * imports and syncs.
 */
export const POST = appRoute(async (request: NextRequest) => {
  if (!tickAllowed(request.headers.get("authorization"))) return appError(401, "Not allowed.");
  const started = Date.now();
  const pushes = await runTick();
  const diary = await runDiaryTick(new Date(), started + DIARY_UNTIL_MS);
  return appJson({ ...pushes, diary });
});
