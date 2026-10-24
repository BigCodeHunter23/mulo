import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The website signs people in with cookies; the app sends a bearer token.
 * Both have to arrive at the same person, verified, and a token that
 * doesn't verify must never count as signed in.
 */

const request = vi.hoisted(() => ({ authorization: null as string | null }));
const made = vi.hoisted(() => ({
  ssr: 0,
  bearer: [] as unknown[],
  claims: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    const h = new Headers();
    if (request.authorization) h.set("authorization", request.authorization);
    return h;
  }),
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}));
vi.mock("@/lib/env", () => ({
  supabaseUrl: () => "https://example.supabase.co",
  supabaseAnonKey: () => "anon",
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => {
    made.ssr += 1;
    return { auth: { getClaims: made.claims } };
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((...args: unknown[]) => {
    made.bearer.push(args[2]);
    return { auth: { getClaims: made.claims } };
  }),
}));

const { createClient, getCurrentUser, parseBearer } = await import("./server");

beforeEach(() => {
  request.authorization = null;
  made.ssr = 0;
  made.bearer = [];
  made.claims.mockReset();
});

describe("parseBearer", () => {
  it.each([
    ["Bearer abc.def.ghi", "abc.def.ghi"],
    ["bearer abc", "abc"],
    ["Bearer   abc", "abc"],
  ])("reads %j", (header, token) => {
    expect(parseBearer(header)).toBe(token);
  });

  it.each([null, "", "Bearer", "Bearer ", "Basic abc", "Bearer a b"])("ignores %j", (header) => {
    expect(parseBearer(header)).toBeNull();
  });
});

describe("createClient", () => {
  it("uses the session cookies when no token is sent, as before", async () => {
    await createClient();
    expect(made.ssr).toBe(1);
    expect(made.bearer).toHaveLength(0);
  });

  it("uses the token, and no cookies, when one is sent", async () => {
    request.authorization = "Bearer token-1";
    await createClient();
    expect(made.ssr).toBe(0);
    expect(made.bearer[0]).toMatchObject({
      global: { headers: { Authorization: "Bearer token-1" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});

describe("getCurrentUser", () => {
  it("verifies the token it was sent", async () => {
    request.authorization = "Bearer token-2";
    made.claims.mockResolvedValue({
      data: { claims: { sub: "user-1", email: "a@b.co" } },
      error: null,
    });
    expect(await getCurrentUser()).toEqual({ id: "user-1", email: "a@b.co" });
    expect(made.claims).toHaveBeenCalledWith("token-2");
  });

  it("refuses a token that doesn't verify", async () => {
    request.authorization = "Bearer forged";
    made.claims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });
    expect(await getCurrentUser()).toBeNull();
  });

  it("reads the cookie session when no token is sent, as before", async () => {
    made.claims.mockResolvedValue({ data: { claims: { sub: "user-3" } }, error: null });
    expect(await getCurrentUser()).toEqual({ id: "user-3", email: null });
    expect(made.claims).toHaveBeenCalledWith();
  });
});
