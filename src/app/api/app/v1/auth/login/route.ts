import type { NextRequest } from "next/server";
import type { AuthResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, toAppSession } from "@/lib/app-route";
import { friendlyError, loginInput, TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { allowAddress } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";
import { firstError } from "@/lib/validation";

/**
 * Logs in from the app and hands it the session to keep. A client with no
 * cookies of its own does the asking, so nothing is written to this response.
 */
export const POST = appRoute(async (request: NextRequest) => {
  // Parsed here rather than with readBody, so a field problem comes back in
  // the login form's own words ("Enter your email address.").
  const raw: unknown = await request.json().catch(() => null);
  const input = loginInput.safeParse(raw);
  if (!input.success) return appError(400, firstError(input.error));
  if (!(await allowAddress("login"))) return appError(429, TOO_MANY_ATTEMPTS);

  const { data, error } = await createPublicClient().auth.signInWithPassword(input.data);
  if (error || !data.session) return appError(401, friendlyError(error?.message ?? ""));

  return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
});
