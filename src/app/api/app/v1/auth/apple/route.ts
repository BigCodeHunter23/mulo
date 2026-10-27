import type { NextRequest } from "next/server";
import { z } from "zod";
import { exchangeAppleCode, jwtSubject } from "@/lib/apple";
import { rememberAppleToken } from "@/lib/apple-tokens";
import { OTHER_ACCOUNT, type AuthResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, readBody, toAppSession } from "@/lib/app-route";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { isOtherAccount, undoSignIn } from "@/lib/other-account";
import { allowAddress } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";

const appleBody = z.object({
  identityToken: z.string().min(1).max(4000),
  nonce: z.string().min(16).max(200),
  authorizationCode: z.string().min(1).max(1000).optional(),
  expectedUserId: z.uuid().optional(),
});

/**
 * Signs in with the token from the iPhone's own Apple sheet. Supabase checks
 * it with Apple and that its nonce matches. The one-time code is swapped for
 * Apple's refresh token, kept so deleting the account can cancel the link,
 * when the code belongs to the same Apple user as the token. When confirming
 * it's them (`expectedUserId`), another account is signed straight back out,
 * before any of its tokens are kept, and refused.
 */
export const POST = appRoute(async (request: NextRequest) => {
  // A malformed body is a fault in the app, not something to word for people.
  const body = await readBody(request, appleBody);
  if (body instanceof Response) return body;
  if (!(await allowAddress("social"))) return appError(429, TOO_MANY_ATTEMPTS);

  const { data, error } = await createPublicClient().auth.signInWithIdToken({
    provider: "apple",
    token: body.identityToken,
    nonce: body.nonce,
  });
  if (error || !data.session) return appError(401, "Apple sign-in didn't work. Try again.");
  if (isOtherAccount(data.session, body.expectedUserId)) {
    await undoSignIn(data.session);
    return appError(409, OTHER_ACCOUNT);
  }

  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (body.authorizationCode && bundleId) {
    const grant = await exchangeAppleCode(body.authorizationCode, bundleId);
    // Keep the token only if the code was issued to the same Apple user as the
    // identity token Supabase has just accepted, so somebody can't attach
    // another Apple account's token to theirs. The identity token's `sub` is
    // read rather than the user's identities: Supabase has just checked that
    // very token (Apple's signature, our bundle id, the nonce), and it came
    // from the same Apple sheet as the code.
    const appleUser = jwtSubject(body.identityToken);
    if (grant && appleUser && grant.sub === appleUser) {
      await rememberAppleToken(data.session.user.id, grant.refreshToken, bundleId);
    } else if (grant) {
      console.warn(
        "[apple] the one-time code isn't for the identity token's Apple user; token not kept.",
      );
    }
  }
  return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
});
