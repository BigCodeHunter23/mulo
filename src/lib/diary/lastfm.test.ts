import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.fake.client }));

import { fakeSupabase } from "../../../test/fake-supabase";
import {
  approvalUrl,
  createConnectState,
  LastfmError,
  lastfmKeys,
  needsReconnect,
  recentTracks,
  saveConnection,
  sessionFor,
  signature,
  stateHash,
  takeConnectState,
} from "./lastfm";

const keys = { key: "KEY", secret: "SECRET" };

const answer = (body: unknown, status = 200) =>
  vi.fn(async (_input: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );

beforeEach(() => {
  db.fake = fakeSupabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lastfmKeys", () => {
  it("needs both the key and the secret", () => {
    vi.stubEnv("LASTFM_API_KEY", "KEY");
    vi.stubEnv("LASTFM_API_SECRET", "");
    expect(lastfmKeys()).toBeNull();
    vi.stubEnv("LASTFM_API_SECRET", "SECRET");
    expect(lastfmKeys()).toEqual(keys);
  });
});

describe("signing", () => {
  it("signs every parameter but format and callback, sorted, then the secret", () => {
    // md5("api_keyKEYmethodauth.getSessiontokenTOKSECRET")
    expect(
      signature(
        { method: "auth.getSession", token: "TOK", api_key: "KEY", format: "json" },
        "SECRET",
      ),
    ).toBe("0bf279e021f3a81b4553dd7e76cf72ad");
  });

  it("gives the same signature whatever order the parameters come in", () => {
    const a = signature({ b: "2", a: "1" }, "S");
    const b = signature({ a: "1", b: "2" }, "S");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("approval and sessions", () => {
  it("builds the approval address with the callback", () => {
    expect(approvalUrl(keys, "https://getmulo.com/diary/lastfm/callback?state=abc")).toBe(
      "https://www.last.fm/api/auth/?api_key=KEY&cb=https%3A%2F%2Fgetmulo.com%2Fdiary%2Flastfm%2Fcallback%3Fstate%3Dabc",
    );
  });

  it("swaps a token for the username and session key", async () => {
    const fetcher = answer({ session: { name: "fran", key: "SK", subscriber: 0 } });
    expect(await sessionFor("TOK", keys, fetcher)).toEqual({ user: "fran", key: "SK" });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("method")).toBe("auth.getSession");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("api_sig")).toBe("0bf279e021f3a81b4553dd7e76cf72ad");
  });

  it("refuses an answer with no session", async () => {
    await expect(sessionFor("TOK", keys, answer({ session: {} }))).rejects.toBeInstanceOf(
      LastfmError,
    );
  });

  it("turns Last.fm's errors into LastfmError, and knows which mean reconnect", async () => {
    await expect(
      sessionFor("TOK", keys, answer({ error: 14, message: "Unauthorized Token" }, 403)),
    ).rejects.toMatchObject({ code: 14 });
    await expect(sessionFor("TOK", keys, answer("down", 502))).rejects.toMatchObject({ code: 0 });
    expect(needsReconnect(new LastfmError(17, "Login required"))).toBe(true);
    expect(needsReconnect(new LastfmError(29, "Rate limit"))).toBe(false);
    expect(needsReconnect(new Error("other"))).toBe(false);
  });
});

describe("recentTracks", () => {
  it("reads plays, leaving out the one playing now", async () => {
    const fetcher = answer({
      recenttracks: {
        track: [
          {
            name: "Nikes",
            artist: { "#text": "Frank Ocean" },
            album: { "#text": "Blonde" },
            "@attr": { nowplaying: "true" },
          },
          {
            name: "Ivy",
            artist: { "#text": "Frank Ocean" },
            album: { "#text": "Blonde" },
            date: { uts: "1760263200" },
          },
        ],
        "@attr": { page: "1", totalPages: "3" },
      },
    });
    const page = await recentTracks("fran", { page: 1, to: 1760300000 }, keys, fetcher);
    expect(page).toEqual({
      page: 1,
      totalPages: 3,
      plays: [{ at: 1760263200000, artist: "Frank Ocean", album: "Blonde", song: "Ivy", ms: null }],
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("method")).toBe("user.getRecentTracks");
    expect(url.searchParams.get("user")).toBe("fran");
    expect(url.searchParams.get("limit")).toBe("200");
    expect(url.searchParams.get("to")).toBe("1760300000");
    expect(url.searchParams.has("from")).toBe(false);
  });

  it("reads a page with a single track, which Last.fm sends as an object", async () => {
    const fetcher = answer({
      recenttracks: {
        track: {
          name: "Ivy",
          artist: { "#text": "Frank Ocean" },
          album: { "#text": "Blonde" },
          date: { uts: "1760263200" },
        },
        "@attr": { page: "1", totalPages: "1" },
      },
    });
    expect((await recentTracks("fran", { page: 1 }, keys, fetcher)).plays).toHaveLength(1);
  });

  it("reads an empty history", async () => {
    const fetcher = answer({
      recenttracks: { track: [], "@attr": { page: "1", totalPages: "0" } },
    });
    expect(await recentTracks("fran", { page: 1, from: 10.5 }, keys, fetcher)).toEqual({
      page: 1,
      totalPages: 0,
      plays: [],
    });
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("from")).toBe("10");
  });
});

describe("the connect state", () => {
  const STATE = "abcdefghijklmnopqrstuvwxyz012345";

  it("is kept only as a hash", () => {
    expect(stateHash("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(stateHash("abc")).not.toContain("abc");
  });

  it("is made for one person for ten minutes, and where they go back to", async () => {
    const at = Date.now();
    const state = await createConnectState("u1", "app");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const upsert = db.fake.callsOn("diary_sources").find((c) => c.method === "upsert");
    const row = upsert?.args[0] as Record<string, string>;
    expect(row).toMatchObject({
      user_id: "u1",
      source: "lastfm",
      pending_hash: stateHash(state),
      pending_to: "app",
    });
    const until = Date.parse(row.pending_until ?? "");
    expect(until - at).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(until - at).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(JSON.stringify(upsert?.args)).not.toContain(state);
  });

  it("is taken once: who started it, and where they go back to", async () => {
    db.fake.answer(
      "diary_sources",
      { data: { user_id: "u1", pending_to: "app" }, error: null },
      { data: [{ user_id: "u1" }], error: null },
    );
    expect(await takeConnectState(STATE)).toEqual({ userId: "u1", to: "app" });
    const calls = db.fake.callsOn("diary_sources");
    expect(calls).toContainEqual({
      table: "diary_sources",
      method: "eq",
      args: ["pending_hash", stateHash(STATE)],
    });
    expect(calls).toContainEqual({
      table: "diary_sources",
      method: "update",
      args: [{ pending_hash: null, pending_until: null, pending_to: null }],
    });
  });

  it("is nothing when somebody else took it first, or it ran out", async () => {
    db.fake.answer(
      "diary_sources",
      { data: { user_id: "u1", pending_to: "web" }, error: null },
      { data: [], error: null },
    );
    expect(await takeConnectState(STATE)).toBeNull();
    expect(await takeConnectState(STATE)).toBeNull();
  });

  it("is nothing for a state that can't be one, without asking", async () => {
    expect(await takeConnectState("not a state!")).toBeNull();
    expect(await takeConnectState("short")).toBeNull();
    expect(db.fake.calls).toEqual([]);
  });
});

describe("saveConnection", () => {
  const at = new Date("2026-10-30T12:00:00Z");
  const saved = () =>
    db.fake.callsOn("diary_sources").find((c) => c.method === "upsert")?.args[0] as Record<
      string,
      unknown
    >;

  it("starts a new account's import from now", async () => {
    await saveConnection("u1", { user: "fran", key: "SK" }, at);
    expect(saved()).toEqual({
      user_id: "u1",
      source: "lastfm",
      lastfm_user: "fran",
      lastfm_session: "SK",
      state: "importing",
      import_to: at.toISOString(),
      import_page: 1,
      import_added: 0,
      carry: null,
      reached_back: null,
      synced_to: at.toISOString(),
    });
  });

  it("lets the same account carry on with an import it hadn't finished", async () => {
    db.fake.answer("diary_sources", { data: { lastfm_user: "Fran", import_page: 7 }, error: null });
    await saveConnection("u1", { user: "fran", key: "SK2" }, at);
    expect(saved()).toEqual({
      user_id: "u1",
      source: "lastfm",
      lastfm_user: "fran",
      lastfm_session: "SK2",
      state: "importing",
    });
  });

  it("goes back to syncing the same account once its import is done", async () => {
    db.fake.answer("diary_sources", {
      data: { lastfm_user: "fran", import_page: null },
      error: null,
    });
    await saveConnection("u1", { user: "fran", key: "SK2" }, at);
    expect(saved()).toMatchObject({ state: "syncing" });
    expect(saved()).not.toHaveProperty("import_page");
  });

  it("throws a failed save", async () => {
    const failure = { code: "57014", message: "slow" };
    db.fake.answer("diary_sources", { data: null, error: null }, { error: failure });
    await expect(saveConnection("u1", { user: "fran", key: "SK" }, at)).rejects.toBe(failure);
  });
});
