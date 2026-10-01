import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/supabase/server";
import { loginPath } from "@/lib/redirects";
import { siteUrl } from "@/lib/site";

/**
 * The signed-in person, or off to log in, coming back to `returnTo` after.
 * Every signed-in-only page starts with this, so none of them can forget the
 * check or lose where somebody was.
 */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(returnTo));
  return user;
}

/**
 * The address links in Supabase's emails come back to.
 *
 * Built from Vercel's own settings, never from the request: a Host header can
 * be forged, and this address ends up in somebody's inbox. Preview
 * deployments use their own branch address, so sign-up and password reset can
 * be tested there; Supabase must list both in its allowed Redirect URLs.
 */
export function authCallbackUrl(next: string): string {
  const preview =
    process.env.VERCEL_ENV === "preview" &&
    (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);
  const origin = preview ? `https://${preview}` : siteUrl();
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
