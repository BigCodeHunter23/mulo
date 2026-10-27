import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_OPTIONS } from "./cookies";

/** The token in an `Authorization: Bearer …` header, or null for anything else. */
export function parseBearer(header: string | null): string | null {
  return header?.match(/^Bearer +(\S+)$/i)?.[1] ?? null;
}

/**
 * The token the app signs its requests with. The website itself never sends
 * one: its session lives in cookies.
 */
export async function bearerToken(): Promise<string | null> {
  return parseBearer((await headers()).get("authorization"));
}

/**
 * Cached per request: a single page render asks for the client from several
 * places, and there is no reason to rebuild it each time.
 *
 * A request from the app carries its session as a bearer token instead of
 * cookies. The client then sends that token with every query, so row-level
 * security sees the same person either way, and every lib function and
 * action works for the app unchanged.
 */
export const createClient = cache(async () => {
  const token = await bearerToken();
  if (token) {
    return createTokenClient<Database>(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll is called from a Server Component; safe to ignore
          // because the proxy refreshes the session on every request.
        }
      },
    },
  });
});

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user, looked up once per request.
 *
 * getClaims() verifies the session token's signature locally when the project
 * signs tokens with asymmetric keys, and otherwise falls back to asking
 * Supabase. Either way the token is verified, never merely trusted from the
 * cookie or the header, but in the common case it skips a network round trip
 * that getUser() would make on every page.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const [supabase, token] = await Promise.all([createClient(), bearerToken()]);
  // A token client holds no session of its own, so it's handed the token to check.
  const { data, error } = token
    ? await supabase.auth.getClaims(token)
    : await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});
