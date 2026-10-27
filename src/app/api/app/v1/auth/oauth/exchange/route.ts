import type { NextRequest } from "next/server";
import { z } from "zod";
import { keepAppleTokenFrom } from "@/lib/apple-tokens";
import type { AuthResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, BAD_REQUEST, readBody, toAppSession } from "@/lib/app-route";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-input";
import { memoryStorage, oauthClient, pendingFlow, restoreStorage } from "@/lib/oauth";
import { allowAddress } from "@/lib/rate-limit";

const exchangeBody = z.object({
  code: z.string().min(1).max(512),
  flowId: z.string().max(64).optional(),
  state: z.string().max(8000),
});

/**
 * Finishes signing in through the browser: swaps the code the browser came
 * back with for a session, using the verifier in the `state` that
 * `auth/oauth/start` handed out. An Apple sign-in's refresh token is kept, so
 * deleting the account can cancel the link.
 */
export const POST = appRoute(async (request: NextRequest) => {
  // A malformed body is a fault in the app, not something to word for people.
  const body = await readBody(request, exchangeBody);
  if (body instanceof Response) return body;
  const restored = restoreStorage(body.state);
  if (!restored) return appError(400, BAD_REQUEST);
  if (!(await allowAddress("social"))) return appError(429, TOO_MANY_ATTEMPTS);

  const flowId = body.flowId ?? pendingFlow(restored);
  const { data, error } = await oauthClient(memoryStorage(restored)).auth.exchangeCodeForSession(
    body.code,
    flowId ? { flowId } : undefined,
  );
  if (error || !data.session) return appError(401, "Couldn't finish signing in. Try again.");

  await keepAppleTokenFrom(data.session);
  return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
});
