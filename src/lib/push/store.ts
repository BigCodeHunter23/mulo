import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Everything push notifications keep in the database (migration 0023). The
 * tables are closed to the public roles, so this reads and writes them with
 * the service role, always for a person the caller has already checked.
 */

const db = () => createAdminClient();

/** Somebody's time zone, or null when we don't know it (or can't read it yet). */
export async function readTimeZone(userId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("personal_settings")
    .select("time_zone")
    .eq("user_id", userId)
    .maybeSingle();
  return error ? null : (data?.time_zone ?? null);
}
