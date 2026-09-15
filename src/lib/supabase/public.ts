import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A client with no user session, for reading public catalogue data where the
 * signed-in user doesn't matter: page titles, link previews, search and
 * discovery. Needing no cookies keeps those reads simple and cacheable.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
