import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/server";
import { getLatestNotificationAt, SEEN_COOKIE } from "@/lib/notifications";

/**
 * Whether the signed-in person has anything they haven't seen. The bell asks
 * after each page change, because the header itself stays put between pages.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ unread: false });

  const [latest, store] = await Promise.all([
    getLatestNotificationAt(user.id),
    cookies(),
  ]);
  const seen = store.get(SEEN_COOKIE)?.value;
  const unread = latest !== null && (!seen || Date.parse(latest) > Date.parse(seen));

  return NextResponse.json(
    { unread },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
