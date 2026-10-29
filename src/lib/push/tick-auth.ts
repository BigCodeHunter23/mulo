import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Whether a call to the clock's endpoint carries its secret
 * (`PUSH_TICK_SECRET`, kept in Vercel and Supabase's Vault). Compared in
 * constant time. Without a secret of at least 32 characters nothing gets in.
 */
export function tickAllowed(
  header: string | null,
  secret: string | undefined = process.env.PUSH_TICK_SECRET,
): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
