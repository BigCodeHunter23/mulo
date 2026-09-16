import "server-only";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The signed-in person, if they're allowed into the reports inbox. Admins are
 * the emails listed in ADMIN_EMAILS, separated by commas. Unset means nobody,
 * so a missing setting locks the inbox rather than opening it.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.email) return null;

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(user.email.toLowerCase()) ? user : null;
}
