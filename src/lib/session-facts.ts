import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { SignInMethod } from "@/lib/app-api";
import { bearerToken, createClient } from "@/lib/supabase/server";

/** How long a sign-in counts as fresh enough to stand in for a password. */
export const FRESH_SECONDS = 5 * 60;

const METHODS = ["email", "apple", "google", "facebook"] as const satisfies readonly SignInMethod[];

export type SessionFacts = {
  signInMethods: SignInMethod[];
  hasPassword: boolean;
  /** Signed in (not just refreshed) in the last FRESH_SECONDS. */
  freshSignIn: boolean;
};

const claimsShape = z.object({
  app_metadata: z
    .object({ providers: z.array(z.unknown()).optional(), has_password: z.boolean().optional() })
    .optional(),
  amr: z.array(z.unknown()).optional(),
});
const amrEntry = z.object({ method: z.string(), timestamp: z.number() });

const isMethod = (value: unknown): value is SignInMethod =>
  METHODS.some((method) => method === value);

/** Pure, for tests: what a token's claims say. */
export function factsFromClaims(
  claims: unknown,
  now = Math.floor(Date.now() / 1000),
): SessionFacts {
  const parsed = claimsShape.safeParse(claims);
  const meta = parsed.success ? parsed.data.app_metadata : undefined;
  const signInMethods = (meta?.providers ?? []).filter(isMethod);
  const times = (parsed.success ? (parsed.data.amr ?? []) : [])
    .map((entry) => amrEntry.safeParse(entry))
    .flatMap((entry) =>
      entry.success && entry.data.method !== "token_refresh" ? [entry.data.timestamp] : [],
    );
  return {
    signInMethods,
    hasPassword: signInMethods.includes("email") || meta?.has_password === true,
    freshSignIn: times.some((t) => now - t >= 0 && now - t <= FRESH_SECONDS),
  };
}

/** The caller's facts, from the same verified claims getCurrentUser reads. */
export const getSessionFacts = cache(async (): Promise<SessionFacts> => {
  const [supabase, token] = await Promise.all([createClient(), bearerToken()]);
  const { data } = token ? await supabase.auth.getClaims(token) : await supabase.auth.getClaims();
  return factsFromClaims(data?.claims);
});
