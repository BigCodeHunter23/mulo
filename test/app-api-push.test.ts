import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The app API's push endpoints. The store and the clock are stand-ins. */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

const store = vi.hoisted(() => ({
  registerDevice: vi.fn(async () => {}),
  removeDevice: vi.fn(async () => {}),
  forgetDevice: vi.fn(async () => {}),
  touchClock: vi.fn(async () => {}),
  readSettings: vi.fn(async () => ({
    follows: true,
    loves: true,
    replies: true,
    versus: true,
    drop: true,
    streak: true,
  })),
  saveSettings: vi.fn(async () => {}),
}));
const tick = vi.hoisted(() => ({ runTick: vi.fn(async () => ({ due: 1, sent: 1, receipts: 0 })) }));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
  allowUser: vi.fn(async () => !caller.limited),
}));
vi.mock("@/lib/push/store", () => store);
vi.mock("@/lib/push/tick", () => tick);

import * as devices from "@/app/api/app/v1/push/devices/route";
import * as forget from "@/app/api/app/v1/push/devices/forget/route";
import { allowAddress } from "@/lib/rate-limit";
import * as settings from "@/app/api/app/v1/me/notifications/route";
import * as clock from "@/app/api/app/v1/push/tick/route";

const TOKEN = "ExponentPushToken[abcdefghij0123456789]";
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("https://mulo.test/api", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  caller.token = "t";
  caller.user = { id: "me", email: null };
  caller.limited = false;
});

afterEach(() => vi.unstubAllEnvs());

describe("push/devices", () => {
  it("registers a phone with its time zone", async () => {
    const res = await devices.POST(
      req("POST", { token: TOKEN, platform: "ios", timeZone: "Europe/London" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.registerDevice).toHaveBeenCalledWith("me", TOKEN, "ios");
    expect(store.touchClock).toHaveBeenCalledWith("me", "Europe/London");
  });

  it("saves a time zone in the runtime's own spelling", async () => {
    await devices.POST(req("POST", { token: TOKEN, platform: "ios", timeZone: "europe/london" }));
    expect(store.touchClock).toHaveBeenCalledWith("me", "Europe/London");
  });

  it("ignores an unknown time zone", async () => {
    await devices.POST(req("POST", { token: TOKEN, platform: "ios", timeZone: "Nowhere/Land" }));
    expect(store.touchClock).toHaveBeenCalledWith("me", null);
  });

  it("refuses something that isn't an Expo push address", async () => {
    const res = await devices.POST(
      req("POST", { token: "hello", platform: "ios", timeZone: null }),
    );
    expect(res.status).toBe(400);
    expect(store.registerDevice).not.toHaveBeenCalled();
  });

  it("needs somebody signed in", async () => {
    caller.token = null;
    caller.user = null;
    expect(
      (await devices.POST(req("POST", { token: TOKEN, platform: "ios", timeZone: null }))).status,
    ).toBe(401);
  });

  it("removes this phone", async () => {
    const res = await devices.DELETE(req("DELETE", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(store.removeDevice).toHaveBeenCalledWith("me", TOKEN);
  });
});

describe("push/devices/forget", () => {
  it("forgets this phone without anybody signed in", async () => {
    caller.token = null;
    caller.user = null;
    const res = await forget.POST(req("POST", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.forgetDevice).toHaveBeenCalledWith(TOKEN);
  });

  it("forgets it even with a session that has ended", async () => {
    caller.token = "expired";
    caller.user = null;
    const res = await forget.POST(req("POST", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(store.forgetDevice).toHaveBeenCalledWith(TOKEN);
  });

  it("is limited per address", async () => {
    caller.limited = true;
    const res = await forget.POST(req("POST", { token: TOKEN }));
    expect(res.status).toBe(429);
    expect(allowAddress).toHaveBeenCalledWith("pushForget");
    expect(store.forgetDevice).not.toHaveBeenCalled();
  });

  it("refuses something that isn't an Expo push address", async () => {
    const res = await forget.POST(req("POST", { token: "hello" }));
    expect(res.status).toBe(400);
    expect(store.forgetDevice).not.toHaveBeenCalled();
  });
});

describe("me/notifications", () => {
  it("answers the switches", async () => {
    const res = await settings.GET();
    expect(await res.json()).toMatchObject({ follows: true, streak: true });
  });

  it("changes only what's sent", async () => {
    const res = await settings.PATCH(req("PATCH", { loves: false }));
    expect(await res.json()).toEqual({ ok: true });
    expect(store.saveSettings).toHaveBeenCalledWith("me", { loves: false });
  });

  it("refuses an empty or unknown change", async () => {
    expect((await settings.PATCH(req("PATCH", {}))).status).toBe(400);
    expect((await settings.PATCH(req("PATCH", { pokes: true }))).status).toBe(400);
  });
});

describe("push/tick", () => {
  it("refuses a call without the secret", async () => {
    vi.stubEnv("PUSH_TICK_SECRET", "s".repeat(40));
    const res = await clock.POST(req("POST", {}, { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(tick.runTick).not.toHaveBeenCalled();
  });

  it("runs with it", async () => {
    vi.stubEnv("PUSH_TICK_SECRET", "s".repeat(40));
    const res = await clock.POST(req("POST", {}, { authorization: `Bearer ${"s".repeat(40)}` }));
    expect(await res.json()).toEqual({ due: 1, sent: 1, receipts: 0 });
  });
});
