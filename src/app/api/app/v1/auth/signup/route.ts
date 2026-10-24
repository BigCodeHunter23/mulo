import type { NextRequest } from "next/server";
import type { AuthResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, toAppSession } from "@/lib/app-route";
import { authCallbackUrl } from "@/lib/auth";
import { AFTER_SIGNUP, friendlyError, signupInput, TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { allowAddress } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";
import { firstError } from "@/lib/validation";

/**
 * Creates an account from the app. With email confirmation on (the usual
 * case) there's no session yet: the emailed link confirms the address on the
 * website, and the person logs in to the app after.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const raw: unknown = await request.json().catch(() => null);
  const input = signupInput.safeParse(raw);
  if (!input.success) return appError(400, firstError(input.error));
  if (!(await allowAddress("signup"))) return appError(429, TOO_MANY_ATTEMPTS);

  const { data, error } = await createPublicClient().auth.signUp({
    ...input.data,
    options: { emailRedirectTo: authCallbackUrl(AFTER_SIGNUP) },
  });
  if (error) return appError(400, friendlyError(error.message));

  if (data.session) {
    return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
  }
  return appJson<AuthResponse>({
    ok: true,
    session: null,
    message: "Account created. Check your email for a confirmation link, then log in here.",
  });
});
