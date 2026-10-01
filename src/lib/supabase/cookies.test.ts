import { describe, expect, it, vi } from "vitest";

describe("session cookie options", () => {
  it("keep the session out of reach of page scripts, and off plain http in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { SESSION_COOKIE_OPTIONS } = await import("./cookies");
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    vi.unstubAllEnvs();
  });
});
