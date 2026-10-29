import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The app API's reply endpoints. The lib and the actions are stand-ins. */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

const lib = vi.hoisted(() => ({
  getThread: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ state: "gone" })),
  postReply: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    ok: true,
    reply: { id: 1 },
  })),
  deleteReply: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
}));

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
vi.mock("@/lib/replies", () => ({ getThread: lib.getThread }));
vi.mock("@/app/replies/actions", () => ({
  postReply: lib.postReply,
  deleteReply: lib.deleteReply,
}));

import * as thread from "@/app/api/app/v1/threads/[kind]/[id]/route";
import * as replies from "@/app/api/app/v1/replies/route";
import * as reply from "@/app/api/app/v1/replies/[id]/route";

const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const req = (method: string, body?: unknown) =>
  new NextRequest("https://mulo.test/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  caller.token = "t";
  caller.user = { id: "me", email: null };
  caller.limited = false;
});

describe("GET threads/{kind}/{id}", () => {
  it("answers a thread by kind and id", async () => {
    lib.getThread.mockResolvedValueOnce({ state: "locked", day: "2026-10-29" });
    const res = await thread.GET(req("GET"), params({ kind: "take", id: "9" }));
    expect(await res.json()).toEqual({ state: "locked", day: "2026-10-29" });
    expect(lib.getThread).toHaveBeenCalledWith("take", 9);
  });

  it("is not found for a kind or id it doesn't know", async () => {
    expect((await thread.GET(req("GET"), params({ kind: "song", id: "9" }))).status).toBe(404);
    expect((await thread.GET(req("GET"), params({ kind: "album", id: "x" }))).status).toBe(404);
    expect(lib.getThread).not.toHaveBeenCalled();
  });

  it("refuses a token that doesn't verify, and keeps to the read limit", async () => {
    caller.user = null;
    expect((await thread.GET(req("GET"), params({ kind: "album", id: "7" }))).status).toBe(401);
    caller.user = { id: "me", email: null };
    caller.limited = true;
    expect((await thread.GET(req("GET"), params({ kind: "album", id: "7" }))).status).toBe(429);
  });
});

describe("POST replies", () => {
  it("posts through the website's own action", async () => {
    const res = await replies.POST(req("POST", { kind: "album", targetId: 7, body: "Yes." }));
    expect(await res.json()).toEqual({ ok: true, reply: { id: 1 } });
    expect(lib.postReply).toHaveBeenCalledWith("album", 7, "Yes.");
  });

  it("refuses a shape it can't read", async () => {
    for (const body of [
      { kind: "song", targetId: 7, body: "x" },
      { kind: "album", targetId: "7", body: "x" },
      { kind: "album", targetId: 0, body: "x" },
      { kind: "album", targetId: -7, body: "x" },
      { kind: "album", targetId: 7 },
    ]) {
      expect((await replies.POST(req("POST", body))).status).toBe(400);
    }
    expect(lib.postReply).not.toHaveBeenCalled();
  });

  it("needs somebody signed in", async () => {
    caller.token = null;
    caller.user = null;
    expect(
      (await replies.POST(req("POST", { kind: "album", targetId: 7, body: "x" }))).status,
    ).toBe(401);
  });
});

describe("DELETE replies/{id}", () => {
  it("deletes through the website's own action", async () => {
    const res = await reply.DELETE(req("DELETE"), params({ id: "41" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.deleteReply).toHaveBeenCalledWith(41);
  });

  it("refuses an id that isn't one", async () => {
    expect((await reply.DELETE(req("DELETE"), params({ id: "0" }))).status).toBe(400);
    expect(lib.deleteReply).not.toHaveBeenCalled();
  });
});
