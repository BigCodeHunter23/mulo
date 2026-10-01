import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/** The addresses in ADMIN_EMAILS, separated by commas. Unset means nobody. */
export function adminEmails(value = process.env.ADMIN_EMAILS): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The signed-in person, if they're allowed into the reports inbox, else null.
 * A missing ADMIN_EMAILS setting locks the inbox rather than opening it.
 *
 * The address must also be confirmed. Were email confirmation ever switched
 * off, anybody could otherwise sign up with an admin's address that hadn't
 * been registered yet. Confirmation lives on the account, not in the session
 * token, so this asks Supabase: a round trip only admins ever pay.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.email || !adminEmails().includes(user.email.toLowerCase())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const account = data.user;
  if (error || !account?.email_confirmed_at || account.id !== user.id) return null;

  return user;
}
