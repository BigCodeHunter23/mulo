"use server";

import { getCurrentUser } from "@/lib/supabase/server";
import { touchClock } from "@/lib/push/store";
import { canonicalZone } from "@/lib/push/zones";
import { allowUser } from "@/lib/rate-limit";

/**
 * The browser says where it is, so streaks and pushes run on the visitor's
 * own clock, and the visit counts as being here (timed pushes stop after 30
 * days away). Nothing for somebody signed out.
 */
export async function reportClock(timeZone: unknown): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  // Each page load reports, so a script calling this in a loop is held to the write limit.
  if (!(await allowUser("write", user.id))) return;
  try {
    await touchClock(user.id, canonicalZone(timeZone));
  } catch (error) {
    console.error("[clock] couldn't note the visit:", error);
  }
}
