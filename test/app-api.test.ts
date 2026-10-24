import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's route layer (`src/app/api/app/v1`): who each endpoint lets
 * in, what it hands the website's own code, and what it answers. The lib
 * functions and actions are stand-ins here; test/actions-auth.test.ts covers
 * the actions themselves.
 */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

/** What Supabase answers a log-in or sign-up. */
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

/** Stand-ins for the lib functions the endpoints read through. */
const lib = vi.hoisted(() => ({
  getOwnProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => ({ auth })) }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
  allowUser: vi.fn(async () => !caller.limited),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/social", () => ({ getOwnProfile: lib.getOwnProfile }));

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const OTHER = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const USER = { id: OTHER, email: "someone@example.com" };

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://mulo.test/api/app/v1/${path}`, init);
}

function json(path: string, method: string, body: unknown) {
  return request(path, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Route parameters, as Next hands them to a handler. */
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function signIn() {
  caller.token = "good";
  caller.user = USER;
}

beforeEach(() => {
  caller.token = null;
  caller.user = null;
  caller.limited = false;
  auth.signInWithPassword.mockReset();
  auth.signUp.mockReset();
  for (const fn of Object.values(lib)) fn.mockReset();
});

const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 1_900_000_000,
  user: { id: OTHER, email: "someone@example.com" },
};

describe("POST auth/login", () => {
  const login = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/login/route")).POST(json("auth/login", "POST", body));

  it("hands back the session", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await login({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
  });

  it("says a wrong password plainly", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    const response = await login({ email: "someone@example.com", password: "wrong" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/doesn't match an account/);
  });

  it("says which field is wrong, before asking Supabase", async () => {
    const response = await login({ email: "", password: "x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Enter your email address.");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a body it can't read", async () => {
    const response = (await import("@/app/api/app/v1/auth/login/route")).POST(
      request("auth/login", { method: "POST", body: "{" }),
    );
    expect((await response).status).toBe(400);
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await login({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(429);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("POST auth/signup", () => {
  const signup = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/signup/route")).POST(json("auth/signup", "POST", body));

  it("asks for a confirmation that lands on the welcome steps", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: OTHER } }, error: null });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(await response.json()).toEqual({
      ok: true,
      session: null,
      message: "Account created. Check your email for a confirmation link, then log in here.",
    });
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(
      /\/auth\/confirm\?next=%2Fwelcome%3Fintro%3D1$/,
    );
  });

  it("hands back the session when Supabase signs them straight in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: SESSION, user: { id: OTHER } }, error: null });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
  });

  it("refuses a short password before asking Supabase", async () => {
    const response = await signup({ email: "someone@example.com", password: "x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least 6/);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("says an existing account plainly", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered" },
    });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already exists/);
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(429);
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("GET me", () => {
  const me = async () => (await import("@/app/api/app/v1/me/route")).GET();

  it("needs a token", async () => {
    expect((await me()).status).toBe(401);
  });

  it("refuses a token that doesn't verify", async () => {
    caller.token = "expired";
    expect((await me()).status).toBe(401);
  });

  it("answers who you are and your profile", async () => {
    signIn();
    const profile = {
      username: "alex",
      display_name: null,
      avatar_url: null,
      raised_on_mbid: null,
    };
    lib.getOwnProfile.mockResolvedValue(profile);
    expect(await (await me()).json()).toEqual({ ...USER, profile });
    expect(lib.getOwnProfile).toHaveBeenCalledWith(OTHER);
  });

  it("says when there's no username yet", async () => {
    signIn();
    lib.getOwnProfile.mockResolvedValue(null);
    expect((await (await me()).json()).profile).toBeNull();
  });
});
