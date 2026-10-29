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
 * This website's own address, for anything that comes back to it from
 * outside: Supabase's emails, Last.fm's approval.
 *
 * Built from Vercel's own settings, never from the request: a Host header can
 * be forged, and this address ends up in somebody's inbox or another site's
 * redirect. Preview deployments use their own branch address, so sign-up,
 * password reset and connecting Last.fm can be tested there.
 */
export function callbackOrigin(): string {
  const preview =
    process.env.VERCEL_ENV === "preview" &&
    (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);
  return preview ? `https://${preview}` : siteUrl();
}

/**
 * The address links in Supabase's emails come back to. Supabase must list
 * both the live and the preview addresses in its allowed Redirect URLs.
 */
export function authCallbackUrl(next: string): string {
  return `${callbackOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`;
}
