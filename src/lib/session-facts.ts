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

/**
 * The `amr` methods that mean somebody actually signed in, as Supabase writes
 * them: with a password, through Apple or Google in the browser, or from a
 * link or code sent to their email. An allowlist on purpose: a second factor
 * (`totp`, `mfa/*`) is added to a session that already exists, so anyone
 * holding a session could otherwise make it fresh; a refresh, an anonymous
 * session or an email change proves nothing either. `id_token` is Apple's own
 * iPhone sheet (`signInWithIdToken`); Supabase records that as `oauth` today,
 * and it's listed in case a later version names it for what it is.
 */
const SIGN_IN_METHODS = [
  "password",
  "oauth",
  "otp",
  "magiclink",
  "recovery",
  "sso/saml",
  "id_token",
] as const;

/** How far ahead of this server's clock a sign-in may be dated, for a slightly fast clock at Supabase. */
const CLOCK_SKEW_SECONDS = 30;

const claimsShape = z.object({
  app_metadata: z
    .object({ providers: z.array(z.unknown()).optional(), has_password: z.boolean().optional() })
    .optional(),
  amr: z.array(z.unknown()).optional(),
});
const amrEntry = z.object({ method: z.string(), timestamp: z.number() });

const isMethod = (value: unknown): value is SignInMethod =>
  METHODS.some((method) => method === value);

const nowInSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Pure, for tests: whether a token's claims record a sign-in by one of
 * `methods` in the last `seconds` (allowing a little clock difference).
 */
export function signedInWithin(
  claims: unknown,
  methods: readonly string[],
  seconds: number,
  now = nowInSeconds(),
): boolean {
  const parsed = claimsShape.safeParse(claims);
  return (parsed.success ? (parsed.data.amr ?? []) : []).some((raw) => {
    const entry = amrEntry.safeParse(raw);
    if (!entry.success || !methods.includes(entry.data.method)) return false;
    const age = now - entry.data.timestamp;
    return age >= -CLOCK_SKEW_SECONDS && age <= seconds;
  });
}

/** Pure, for tests: what a token's claims say. */
export function factsFromClaims(claims: unknown, now = nowInSeconds()): SessionFacts {
  const parsed = claimsShape.safeParse(claims);
  const meta = parsed.success ? parsed.data.app_metadata : undefined;
  const signInMethods = (meta?.providers ?? []).filter(isMethod);
  return {
    signInMethods,
    hasPassword: signInMethods.includes("email") || meta?.has_password === true,
    freshSignIn: signedInWithin(claims, SIGN_IN_METHODS, FRESH_SECONDS, now),
  };
}

/** The caller's facts, from the same verified claims getCurrentUser reads. */
export const getSessionFacts = cache(async (): Promise<SessionFacts> => {
  const [supabase, token] = await Promise.all([createClient(), bearerToken()]);
  const { data } = token ? await supabase.auth.getClaims(token) : await supabase.auth.getClaims();
  return factsFromClaims(data?.claims);
});
