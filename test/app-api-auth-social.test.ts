import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's social log-ins (`auth/apple`, and `auth/oauth/start` with
 * `auth/oauth/exchange` through the browser): what each hands Supabase and answers.
 */

const caller = vi.hoisted(() => ({ limited: false }));

const auth = vi.hoisted(() => ({ signInWithIdToken: vi.fn() }));
const apple = vi.hoisted(() => ({ exchangeAppleCode: vi.fn(), rememberAppleToken: vi.fn() }));

/** Browser sign-ins build their own client over storage the route hands it. */
type OAuthStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
const oauth = vi.hoisted(() => ({
  storages: new Array<OAuthStorage>(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => ({ auth })) }));
vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: vi.fn(
    (_url: string, _key: string, options: { auth: { storage: OAuthStorage } }) => {
      const storage = options.auth.storage;
      oauth.storages.push(storage);
      return {
        auth: {
          signInWithOAuth: (credentials: unknown) => oauth.signInWithOAuth(credentials, storage),
          exchangeCodeForSession: (code: string, more: unknown) =>
            oauth.exchangeCodeForSession(code, more),
        },
      };
    },
  ),
}));
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
  oauth.storages = [];
  oauth.signInWithOAuth.mockReset();
  oauth.exchangeCodeForSession.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("APPLE_BUNDLE_ID", "");
  vi.stubEnv("APPLE_SERVICES_ID", "");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
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

const KEY = "mulo-app-oauth";
const FLOW = "0123456789abcdef0123456789abcdef";
const SLOT = `${KEY}-flow-${FLOW}-code-verifier`;
const AUTHORIZE = "https://project.supabase.co/auth/v1/authorize?provider=google";

describe("POST auth/oauth/start", () => {
  const start = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/oauth/start/route")).POST(json("auth/oauth/start", body));
  const google = { provider: "google", redirectTo: "mulo://auth/callback" };

  /** Supabase keeps the verifier in the storage it was given, as auth-js does. */
  function startsSigningIn() {
    oauth.signInWithOAuth.mockImplementation(
      async (_credentials: unknown, storage: OAuthStorage) => {
        storage.setItem(SLOT, JSON.stringify("the-verifier"));
        return { data: { provider: "google", url: AUTHORIZE }, error: null };
      },
    );
  }

  it("hands back the page to open and the state that proves the code is ours", async () => {
    startsSigningIn();
    const response = await start(google);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, url: AUTHORIZE, state: expect.any(String) });
    expect(JSON.parse(body.state)).toEqual({ [SLOT]: JSON.stringify("the-verifier") });
    expect(oauth.signInWithOAuth).toHaveBeenCalledWith(
      {
        provider: "google",
        options: { redirectTo: "mulo://auth/callback", skipBrowserRedirect: true },
      },
      expect.anything(),
    );
  });

  it("asks Apple for the name and email", async () => {
    startsSigningIn();
    const response = await start({ ...google, provider: "apple" });
    expect(response.status).toBe(200);
    expect(oauth.signInWithOAuth).toHaveBeenCalledWith(
      {
        provider: "apple",
        options: {
          redirectTo: "mulo://auth/callback",
          skipBrowserRedirect: true,
          scopes: "name email",
        },
      },
      expect.anything(),
    );
  });

  it("allows Expo's development address outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    startsSigningIn();
    const redirectTo = "exp://192.168.1.7:8081/--/auth/callback";
    const response = await start({ ...google, redirectTo });
    expect(response.status).toBe(200);
  });

  it("says Facebook isn't available yet", async () => {
    const response = await start({ ...google, provider: "facebook" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("That sign-in isn't available yet.");
    expect(oauth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("refuses a return address that isn't the app's", async () => {
    for (const redirectTo of [
      "https://evil.example/cb",
      "exp://192.168.1.7:8081/--/auth/callback",
    ]) {
      const response = await start({ ...google, redirectTo });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(BAD_REQUEST);
    }
    expect(oauth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("refuses a provider it doesn't know", async () => {
    const response = await start({ ...google, provider: "github" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BAD_REQUEST);
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await start(google);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(TOO_MANY_ATTEMPTS);
    expect(oauth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("says plainly when Supabase can't start", async () => {
    oauth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: null },
      error: { message: "Unsupported provider" },
    });
    const response = await start(google);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Couldn't start signing in. Try again.");
  });
});

describe("POST auth/oauth/exchange", () => {
  const exchange = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/oauth/exchange/route")).POST(
      json("auth/oauth/exchange", body),
    );
  const state = JSON.stringify({
    [SLOT]: JSON.stringify("the-verifier"),
    [`${KEY}-flows-code-verifier`]: JSON.stringify([FLOW]),
    [`${KEY}-code-verifier`]: JSON.stringify("the-verifier"),
  });
  const ok = { code: "the-code", flowId: FLOW, state };

  it("swaps the code over the restored state and answers the session", async () => {
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await exchange(ok);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
    expect(oauth.exchangeCodeForSession).toHaveBeenCalledWith("the-code", { flowId: FLOW });
    expect(oauth.storages[0]?.getItem(SLOT)).toBe(JSON.stringify("the-verifier"));
  });

  it("finds the flow in the state when the return address didn't carry it", async () => {
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await exchange({ code: "the-code", state });
    expect(response.status).toBe(200);
    expect(oauth.exchangeCodeForSession).toHaveBeenCalledWith("the-code", { flowId: FLOW });
  });

  it("keeps Apple's refresh token, and never hands it to the app", async () => {
    vi.stubEnv("APPLE_SERVICES_ID", "com.mulo.web");
    const session = {
      ...SESSION,
      provider_refresh_token: "apple-refresh",
      user: { ...SESSION.user, app_metadata: { provider: "apple" } },
    };
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    const response = await exchange(ok);
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
    expect(apple.rememberAppleToken).toHaveBeenCalledWith(OTHER, "apple-refresh", "com.mulo.web");
  });

  it("keeps no token for Google, or without the services id", async () => {
    const google = {
      ...SESSION,
      provider_refresh_token: "google-refresh",
      user: { ...SESSION.user, app_metadata: { provider: "google" } },
    };
    vi.stubEnv("APPLE_SERVICES_ID", "com.mulo.web");
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: google }, error: null });
    await exchange(ok);

    vi.stubEnv("APPLE_SERVICES_ID", "");
    const appleSession = {
      ...google,
      user: { ...google.user, app_metadata: { provider: "apple" } },
    };
    oauth.exchangeCodeForSession.mockResolvedValue({
      data: { session: appleSession },
      error: null,
    });
    await exchange(ok);

    expect(apple.rememberAppleToken).not.toHaveBeenCalled();
  });

  it("refuses a state that isn't what start handed out", async () => {
    for (const bad of ["not json", "[]", JSON.stringify({ other: '"x"' })]) {
      const response = await exchange({ ...ok, state: bad });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(BAD_REQUEST);
    }
    expect(oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("refuses a body with no code", async () => {
    const response = await exchange({ state });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BAD_REQUEST);
  });

  it("says plainly when Supabase refuses the code", async () => {
    oauth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid flow state" },
    });
    const response = await exchange(ok);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Couldn't finish signing in. Try again.");
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await exchange(ok);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(TOO_MANY_ATTEMPTS);
    expect(oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
