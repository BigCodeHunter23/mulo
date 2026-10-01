import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl, serviceRoleKey } from "@/lib/env";

// Service role key bypasses Row Level Security. Only ever used server-side,
// for writing catalog data cached from MusicBrainz.
export function createAdminClient() {
  return createClient<Database>(
    supabaseUrl(),
    serviceRoleKey(),
    { auth: { persistSession: false } },
  );
}
