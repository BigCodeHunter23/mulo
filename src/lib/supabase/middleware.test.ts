import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const claims = vi.hoisted(() => ({ sub: null as string | null }));
const allow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  supabaseUrl: () => "https://example.supabase.co",
  supabaseAnonKey: () => "anon",
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: claims.sub ? { claims: { sub: claims.sub } } : null }),
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ allow }));

import { updateSession } from "./middleware";

const load = (path: string) =>
  new NextRequest(`https://mulo.test${path}`, { headers: { "x-forwarded-for": "203.0.113.9" } });

beforeEach(() => {
  claims.sub = null;
  allow.mockReset();
  allow.mockResolvedValue(true);
});

describe("how fast a signed-out visitor can load pages", () => {
  it("counts a signed-out page load against their address", async () => {
    const response = await updateSession(load("/album/x"));
    expect(allow).toHaveBeenCalledWith("pageLoad", "ip:203.0.113.9");
    expect(response.status).toBe(200);
  });

  it("asks them to slow down once they're over", async () => {
    allow.mockResolvedValue(false);
    const response = await updateSession(load("/album/x"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("never counts somebody signed in", async () => {
    claims.sub = "user-1";
    allow.mockResolvedValue(false);
    const response = await updateSession(load("/album/x"));
    expect(allow).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("doesn't put everybody without an address in one bucket", async () => {
    allow.mockResolvedValue(false);
    const response = await updateSession(new NextRequest("https://mulo.test/album/x"));
    expect(allow).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("doesn't count the log-in page", async () => {
    await updateSession(load("/login"));
    expect(allow).not.toHaveBeenCalled();
  });

  it("still sends a signed-out visitor from a private page to log in", async () => {
    const response = await updateSession(load("/profile"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
