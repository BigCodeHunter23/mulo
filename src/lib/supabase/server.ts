import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cached per request: a single page render asks for the client from several
 * places, and there is no reason to rebuild it each time.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component; safe to ignore
            // because the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
});

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user, looked up once per request.
 *
 * getClaims() verifies the session token's signature locally when the project
 * signs tokens with asymmetric keys, and otherwise falls back to asking
 * Supabase. Either way the token is verified, never merely trusted from the
 * cookie, but in the common case it skips a network round trip that
 * getUser() would make on every page.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});
