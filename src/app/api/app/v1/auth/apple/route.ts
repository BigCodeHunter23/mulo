import type { NextRequest } from "next/server";
import { z } from "zod";
import { exchangeAppleCode } from "@/lib/apple";
import { rememberAppleToken } from "@/lib/apple-tokens";
import type { AuthResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, readBody, toAppSession } from "@/lib/app-route";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { allowAddress } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";

const appleBody = z.object({
  identityToken: z.string().min(1).max(4000),
  nonce: z.string().min(16).max(200),
  authorizationCode: z.string().min(1).max(1000).optional(),
});

/**
 * Signs in with the token from the iPhone's own Apple sheet. Supabase checks
 * it with Apple and that its nonce matches. The one-time code is swapped for
 * Apple's refresh token, kept so deleting the account can cancel the link.
 */
export const POST = appRoute(async (request: NextRequest) => {
  // A malformed body is a fault in the app, not something to word for people.
  const body = await readBody(request, appleBody);
  if (body instanceof Response) return body;
  if (!(await allowAddress("login"))) return appError(429, TOO_MANY_ATTEMPTS);

  const { data, error } = await createPublicClient().auth.signInWithIdToken({
    provider: "apple",
    token: body.identityToken,
    nonce: body.nonce,
  });
  if (error || !data.session) return appError(401, "Apple sign-in didn't work. Try again.");

  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (body.authorizationCode && bundleId) {
    const refresh = await exchangeAppleCode(body.authorizationCode, bundleId);
    if (refresh) await rememberAppleToken(data.session.user.id, refresh, bundleId);
  }
  return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
});
