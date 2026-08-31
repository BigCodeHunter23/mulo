import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service role key bypasses Row Level Security. Only ever used server-side,
// for writing catalog data cached from MusicBrainz.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
