"use server";

import { getCurrentUser } from "@/lib/supabase/server";
import { touchClock } from "@/lib/push/store";
import { isTimeZone } from "@/lib/push/zones";

/**
 * The browser says where it is, so streaks and pushes run on the visitor's
 * own clock, and the visit counts as being here (timed pushes stop after 30
 * days away). Nothing for somebody signed out.
 */
export async function reportClock(timeZone: unknown): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await touchClock(user.id, isTimeZone(timeZone) ? timeZone : null);
  } catch (error) {
    console.error("[clock] couldn't note the visit:", error);
  }
}
