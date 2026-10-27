import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
}));

const { appCaller, appError, appJson, appRoute, readBody, signedInCaller, toAppSession } =
  await import("./app-route");
const { RateLimitedError } = await import("@/lib/rate-limit");

const USER = { id: "user-1", email: null };

beforeEach(() => {
  caller.token = null;
  caller.user = null;
});

describe("appJson and appError", () => {
  it("never lets a shared cache keep an answer", async () => {
    const response = appJson({ a: 1 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("answers errors in the actions' own shape", async () => {
    const response = appError(404, "Not here.");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Not here." });
  });
});

describe("appCaller", () => {
  it("lets a signed-out caller through", async () => {
    expect(await appCaller()).toEqual({ user: null });
  });

  it("knows a signed-in caller", async () => {
    caller.token = "good";
    caller.user = USER;
    expect(await appCaller()).toEqual({ user: USER });
  });

  it("refuses a token that doesn't verify, so the app refreshes it", async () => {
    caller.token = "expired";
    const response = await appCaller();
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });
});

describe("signedInCaller", () => {
  it("refuses no token", async () => {
    const response = (await signedInCaller()) as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Log in first." });
  });

  it("refuses a bad token", async () => {
    caller.token = "forged";
    const response = (await signedInCaller()) as Response;
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/log in again/);
  });

  it("returns the person", async () => {
    caller.token = "good";
    caller.user = USER;
    expect(await signedInCaller()).toEqual(USER);
  });
});

describe("readBody", () => {
  const schema = z.object({ n: z.number() });
  const post = (body: string) => new Request("http://x/", { method: "POST", body });

  it("parses a body that fits", async () => {
    expect(await readBody(post('{"n":1}'), schema)).toEqual({ n: 1 });
  });

  it.each(["not json", '{"n":"1"}', ""])("refuses %j with 400", async (body) => {
    const response = (await readBody(post(body), schema)) as Response;
    expect(response.status).toBe(400);
  });
});

describe("appRoute", () => {
  it("turns MULO's rate limit into 429", async () => {
    const route = appRoute(async () => {
      throw new RateLimitedError("catalog");
    });
    const response = await route();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("turns anything unexpected into a plain 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = appRoute(async () => {
      throw new Error("relation does not exist");
    });
    const response = await route();
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toMatch(/relation/);
  });

  it("passes a good answer straight through", async () => {
    const route = appRoute(async (n: number) => appJson({ n }));
    expect(await (await route(2)).json()).toEqual({ n: 2 });
  });
});

describe("toAppSession", () => {
  it("keeps just what the app needs", () => {
    // Shaped like Supabase's own session, which carries more than the app keeps.
    const session = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 5,
      token_type: "bearer",
      user: { id: "u", email: "e@x.co", aud: "authenticated" },
    };
    expect(toAppSession(session)).toEqual({
      access_token: "a",
      refresh_token: "r",
      expires_at: 5,
      user: { id: "u", email: "e@x.co" },
    });
  });

  it("fills in what Supabase left out", () => {
    expect(toAppSession({ access_token: "a", refresh_token: "r", user: { id: "u" } })).toEqual({
      access_token: "a",
      refresh_token: "r",
      expires_at: null,
      user: { id: "u", email: null },
    });
  });
});
