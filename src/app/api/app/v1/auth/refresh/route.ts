import type { NextRequest } from "next/server";
import { z } from "zod";
import type { AuthResponse } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  readBody,
  SESSION_ENDED,
  toAppSession,
} from "@/lib/app-route";
import { createPublicClient } from "@/lib/supabase/public";

const refreshBody = z.object({ refresh_token: z.string().min(1).max(512) });

/**
 * Trades the app's refresh token for a fresh session. Supabase hands back a
 * new refresh token each time and retires the old one, so the app keeps the
 * new one.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const body = await readBody(request, refreshBody);
  if (body instanceof Response) return body;

  const { data, error } = await createPublicClient().auth.refreshSession(body);
  if (error || !data.session) return appError(401, SESSION_ENDED);

  return appJson<AuthResponse>({ ok: true, session: toAppSession(data.session) });
});
