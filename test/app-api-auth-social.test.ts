import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The app API's social log-ins (`auth/apple`): what each hands Supabase and answers. */

const caller = vi.hoisted(() => ({ limited: false }));

const auth = vi.hoisted(() => ({ signInWithIdToken: vi.fn() }));
const apple = vi.hoisted(() => ({ exchangeAppleCode: vi.fn(), rememberAppleToken: vi.fn() }));

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => ({ auth })) }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
}));
vi.mock("@/lib/apple", () => ({ exchangeAppleCode: apple.exchangeAppleCode }));
vi.mock("@/lib/apple-tokens", () => ({ rememberAppleToken: apple.rememberAppleToken }));

import { BAD_REQUEST } from "@/lib/app-route";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-input";

const OTHER = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 1_900_000_000,
  user: { id: OTHER, email: "someone@example.com" },
};
const NONCE = "a-raw-nonce-of-enough-length";

function json(path: string, body: unknown) {
  return new NextRequest(`https://mulo.test/api/app/v1/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  caller.limited = false;
  auth.signInWithIdToken.mockReset();
  apple.exchangeAppleCode.mockReset();
  apple.rememberAppleToken.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("APPLE_BUNDLE_ID", "");
});

describe("POST auth/apple", () => {
  const signIn = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/apple/route")).POST(json("auth/apple", body));
  const ok = { identityToken: "apple-token", nonce: NONCE };

  it("hands back the session, asking Supabase to check the token and nonce", async () => {
    auth.signInWithIdToken.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await signIn(ok);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "apple-token",
      nonce: NONCE,
    });
  });

  it("keeps Apple's refresh token when it has the one-time code", async () => {
    vi.stubEnv("APPLE_BUNDLE_ID", "com.mulo.app");
    auth.signInWithIdToken.mockResolvedValue({ data: { session: SESSION }, error: null });
    apple.exchangeAppleCode.mockResolvedValue("apple-refresh");
    const response = await signIn({ ...ok, authorizationCode: "one-time" });
    expect(response.status).toBe(200);
    expect(apple.exchangeAppleCode).toHaveBeenCalledWith("one-time", "com.mulo.app");
    expect(apple.rememberAppleToken).toHaveBeenCalledWith(OTHER, "apple-refresh", "com.mulo.app");
  });

  it("still signs in when Apple won't swap the code", async () => {
    vi.stubEnv("APPLE_BUNDLE_ID", "com.mulo.app");
    auth.signInWithIdToken.mockResolvedValue({ data: { session: SESSION }, error: null });
    apple.exchangeAppleCode.mockResolvedValue(null);
    const response = await signIn({ ...ok, authorizationCode: "one-time" });
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
    expect(apple.rememberAppleToken).not.toHaveBeenCalled();
  });

  it("doesn't try the swap without the bundle id", async () => {
    auth.signInWithIdToken.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await signIn({ ...ok, authorizationCode: "one-time" });
    expect(response.status).toBe(200);
    expect(apple.exchangeAppleCode).not.toHaveBeenCalled();
  });

  it("says plainly when Supabase refuses the token", async () => {
    auth.signInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: { message: "Nonces mismatch" },
    });
    const response = await signIn({ ...ok, authorizationCode: "one-time" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Apple sign-in didn't work. Try again.");
    expect(apple.exchangeAppleCode).not.toHaveBeenCalled();
  });

  it("refuses a body with no identity token", async () => {
    const response = await signIn({ nonce: NONCE });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BAD_REQUEST);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await signIn(ok);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(TOO_MANY_ATTEMPTS);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});
