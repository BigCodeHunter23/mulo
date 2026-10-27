import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { AppError, AppSession } from "@/lib/app-api";
import { allowAddress, allowUser, RateLimitedError, TOO_MANY } from "@/lib/rate-limit";
import { bearerToken, getCurrentUser, type CurrentUser } from "@/lib/supabase/server";

/**
 * The pieces every app endpoint (`src/app/api/app/v1`) is built from. Each
 * one checks who's asking, reads its input, calls the same lib function or
 * action the website uses, and answers JSON. See docs/architecture.md.
 */

export const SIGN_IN_FIRST = "Log in first.";
export const SESSION_ENDED = "Your session has ended. Please log in again.";
export const BAD_REQUEST = "Couldn't read that. Please try again.";
export const SERVER_TROUBLE = "Something went wrong on our side. Please try again in a minute.";

/** Route parameters, as Next hands them to a handler. */
export type Params<T> = { params: Promise<T> };

/**
 * A JSON answer. Everything here can depend on who asked, so no shared cache
 * may keep it.
 */
export function appJson<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** An error, in the shape the website's actions already answer with. */
export function appError(status: number, error: string): NextResponse<AppError> {
  return appJson<AppError>({ ok: false, error }, status);
}

/**
 * Whoever is asking, signed in or not. A token that was sent but doesn't
 * verify is refused rather than treated as signed out, so the app knows to
 * refresh it instead of quietly showing a signed-out page.
 */
export async function appCaller(): Promise<{ user: CurrentUser | null } | NextResponse<AppError>> {
  const [token, user] = await Promise.all([bearerToken(), getCurrentUser()]);
  if (token && !user) return appError(401, SESSION_ENDED);
  return { user };
}

/** The signed-in person, or a 401 for an endpoint that needs one. */
export async function signedInCaller(): Promise<CurrentUser | NextResponse<AppError>> {
  const [token, user] = await Promise.all([bearerToken(), getCurrentUser()]);
  if (user) return user;
  return appError(401, token ? SESSION_ENDED : SIGN_IN_FIRST);
}

/**
 * The app's reads, limited per person when signed in and per address
 * otherwise. Throws, so `appRoute` answers 429.
 */
export async function limitReads(user: CurrentUser | null): Promise<void> {
  const allowed = user ? await allowUser("read", user.id) : await allowAddress("read");
  if (!allowed) throw new RateLimitedError("read");
}

/**
 * A JSON body checked against `schema`, or a 400. Callers tell the two apart
 * with `instanceof Response`; no body schema parses to one.
 */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | NextResponse<AppError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return appError(400, BAD_REQUEST);
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : appError(400, BAD_REQUEST);
}

/**
 * Wraps a handler so a failure never reaches the app as a stack trace: MULO's
 * own rate limit is a 429, anything else a plain 500, logged here.
 */
export function appRoute<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof RateLimitedError) {
        const response = appError(429, TOO_MANY);
        response.headers.set("Retry-After", "60");
        return response;
      }
      console.error("[app-api] request failed:", error);
      return appError(500, SERVER_TROUBLE);
    }
  };
}

/** Just what the app keeps of a Supabase session. */
export function toAppSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
}): AppSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}
