"use server";

import { cookies } from "next/headers";
import { SEEN_COOKIE } from "@/lib/notifications";

/** Called once the notifications page has been seen, to clear the bell's dot. */
export async function markNotificationsSeen() {
  const store = await cookies();
  store.set(SEEN_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
