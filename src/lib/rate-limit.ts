import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How often each thing may happen, counted in Postgres (migration 0017).
 * Generous for a person using the site; tight for a script hammering it.
 */
export const LIMITS = {
  /** Per address. Supabase limits these too; this stops guessing sooner. */
  login: { limit: 10, windowSeconds: 5 * 60 },
  signup: { limit: 5, windowSeconds: 60 * 60 },
  reset: { limit: 5, windowSeconds: 60 * 60 },
  /** Per address: albums and artists MULO hasn't cached, fetched from MusicBrainz. */
  catalog: { limit: 30, windowSeconds: 60 },
  /** Per address: searches passed on to MusicBrainz, and MULO's own. */
  widerSearch: { limit: 30, windowSeconds: 60 },
  search: { limit: 120, windowSeconds: 60 },
  /** Per person: ratings, reactions, follows, picks, list edits. A fast Stack run is ~10 a minute. */
  write: { limit: 120, windowSeconds: 60 },
  /** Per person: new lists, takes and nominations, which other people read. */
  post: { limit: 30, windowSeconds: 60 * 60 },
  report: { limit: 20, windowSeconds: 60 * 60 },
} as const;

export type Bucket = keyof typeof LIMITS;

/** What people see when they hit a limit. */
export const TOO_MANY = "You're doing that a lot. Please wait a minute and try again.";

/** Thrown when a page can't be built because a limit was hit. */
export class RateLimitedError extends Error {
  constructor(bucket: Bucket) {
    super(`Rate limited: ${bucket}`);
  }
}

// Until migration 0017 runs, the function doesn't exist: allow everything
// rather than break the site, and say so once.
let limiterMissing = false;

/** The visitor's address. Vercel sets these headers itself, so they can't be forged. */
export async function requestAddress(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Counts one hit for `subject` and says whether it's within the limit.
 *
 * Fails open: if the database can't be asked, the request goes ahead. A
 * limiter outage should never take the site down with it.
 */
export async function allow(bucket: Bucket, subject: string): Promise<boolean> {
  if (limiterMissing) return true;
  const { limit, windowSeconds } = LIMITS[bucket];

  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_subject: subject,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        limiterMissing = true;
        console.warn("[rate-limit] rate_limit_hit() not found; run migration 0017. Allowing everything.");
      } else {
        console.error("[rate-limit] check failed, allowing:", error.message);
      }
      return true;
    }
    if (data === false) console.warn(`[rate-limit] ${bucket} limit reached for ${subject}`);
    return data !== false;
  } catch (error) {
    console.error("[rate-limit] check failed, allowing:", error);
    return true;
  }
}

/** A limit per signed-in person. */
export function allowUser(bucket: Bucket, userId: string): Promise<boolean> {
  return allow(bucket, `user:${userId}`);
}

/** A limit per address, for things done signed out. */
export async function allowAddress(bucket: Bucket): Promise<boolean> {
  return allow(bucket, `ip:${await requestAddress()}`);
}
