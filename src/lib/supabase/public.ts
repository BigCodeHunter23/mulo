import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

/**
 * A client with no user session, for reading public catalogue data where the
 * signed-in user doesn't matter: page titles, link previews, search and
 * discovery. Needing no cookies keeps those reads simple and cacheable.
 */
export function createPublicClient() {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
