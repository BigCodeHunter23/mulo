import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));

import { config, proxy } from "./proxy";

const GPT = "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)";
const at = (path: string, agent?: string) =>
  new NextRequest(`https://mulo.test${path}`, {
    headers: agent ? { "user-agent": agent } : {},
  });

beforeEach(() => {
  updateSession.mockReset();
  updateSession.mockResolvedValue(NextResponse.next());
});

describe("proxy", () => {
  it("turns a blocked crawler away before any work is done", async () => {
    const response = await proxy(at("/album/x", GPT));
    expect(response.status).toBe(403);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("turns one away from the app's API too", async () => {
    expect((await proxy(at("/api/app/v1/albums/x", GPT))).status).toBe(403);
  });

  it("hands everybody else on", async () => {
    await proxy(at("/album/x", "Mozilla/5.0 (compatible; Googlebot/2.1)"));
    expect(updateSession).toHaveBeenCalledOnce();
  });

  it("leaves the app's API to its own proxy", async () => {
    const response = await proxy(at("/api/app/v1/me", "MULO/1"));
    expect(updateSession).not.toHaveBeenCalled();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("doesn't run for robots.txt, so a crawler can always read it", () => {
    expect(config.matcher[0]).toContain("robots\\.txt");
  });
});
