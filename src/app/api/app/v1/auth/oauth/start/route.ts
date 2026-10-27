import type { NextRequest } from "next/server";
import { z } from "zod";
import type { OAuthStartResult } from "@/lib/app-api";
import { appError, appJson, appRoute, BAD_REQUEST, readBody } from "@/lib/app-route";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { allowedRedirect, memoryStorage, oauthClient, PROVIDER_OFF, providerOn } from "@/lib/oauth";
import { allowAddress } from "@/lib/rate-limit";

const startBody = z.object({
  provider: z.enum(["apple", "google", "facebook"]),
  redirectTo: z.string().max(300),
});

/**
 * Starts signing in through the browser: the page for the app to open, and
 * `state` (Supabase's storage, holding the PKCE verifier) for the app to hand
 * back to `auth/oauth/exchange`. Nothing is kept here.
 */
export const POST = appRoute(async (request: NextRequest) => {
  // A malformed body is a fault in the app, not something to word for people.
  const body = await readBody(request, startBody);
  if (body instanceof Response) return body;
  if (!providerOn(body.provider)) return appError(400, PROVIDER_OFF);
  if (!allowedRedirect(body.redirectTo)) return appError(400, BAD_REQUEST);
  if (!(await allowAddress("login"))) return appError(429, TOO_MANY_ATTEMPTS);

  const storage = memoryStorage();
  const { data, error } = await oauthClient(storage).auth.signInWithOAuth({
    provider: body.provider,
    options: {
      redirectTo: body.redirectTo,
      skipBrowserRedirect: true,
      // Apple only shares a name and email when asked, and only the first time.
      ...(body.provider === "apple" ? { scopes: "name email" } : {}),
    },
  });
  if (error || !data.url) return appError(400, "Couldn't start signing in. Try again.");
  return appJson<OAuthStartResult>({ ok: true, url: data.url, state: storage.snapshot() });
});
