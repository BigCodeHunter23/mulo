import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * How the session cookies are written. Only the server ever reads them (no
 * page talks to Supabase from the browser), so scripts on the page have no
 * reason to see them: httpOnly keeps a stray script from lifting a session.
 * Secure everywhere but local development, which runs over plain http.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
