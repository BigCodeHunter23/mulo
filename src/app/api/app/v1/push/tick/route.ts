import type { NextRequest } from "next/server";
import { appError, appJson, appRoute } from "@/lib/app-route";
import { runTick } from "@/lib/push/tick";
import { tickAllowed } from "@/lib/push/tick-auth";

/** Long enough for a run that sends to a few thousand phones. */
export const maxDuration = 60;

/**
 * The clock: Supabase calls this every 15 minutes with the shared secret
 * (supabase/setup/push-clock.sql). Anyone else gets a 401.
 */
export const POST = appRoute(async (request: NextRequest) => {
  if (!tickAllowed(request.headers.get("authorization"))) return appError(401, "Not allowed.");
  return appJson(await runTick());
});
