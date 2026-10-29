import { beforeEach, describe, expect, it, vi } from "vitest";

/** The diary's website actions. The diary's lib and Last.fm are stand-ins. */

const MBID = "f5093c06-23e3-404f-aeaa-40f72885ee3a";

type Fn = (...args: unknown[]) => Promise<unknown>;

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  limited: new Set<string>(),
  host: "getmulo.com",
  keys: { key: "KEY", secret: "SECRET" } as { key: string; secret: string } | null,
}));

const lib = vi.hoisted(() => ({
  saveAlbumDays: vi.fn<Fn>(async () => ({ ok: true, added: 3, merged: 0 })),
  finishImport: vi.fn<Fn>(async () => undefined),
  deleteEntry: vi.fn<Fn>(async () => ({ ok: true })),
  removeSource: vi.fn<Fn>(async () => ({ ok: true })),
  fixAlbum: vi.fn<Fn>(async () => ({ ok: true })),
  setDiaryPublic: vi.fn<Fn>(async () => ({ ok: true })),
  logListen: vi.fn<Fn>(async () => ({ ok: true })),
  createConnectState: vi.fn<Fn>(async () => "STATE"),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/rate-limit", () => ({
  allowUser: vi.fn(async (bucket: string) => !state.limited.has(bucket)),
  TOO_MANY: "You're doing that a lot. Please wait a minute and try again.",
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: state.host })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/diary/entries", async (original) => ({
  ...(await original<typeof import("@/lib/diary/entries")>()),
  ...lib,
}));
vi.mock("@/lib/diary/lastfm", async (original) => ({
  ...(await original<typeof import("@/lib/diary/lastfm")>()),
  lastfmKeys: () => state.keys,
  createConnectState: lib.createConnectState,
}));

import {
  deleteDiaryEntry,
  fixDiaryAlbum,
  logDiaryListen,
  removeDiarySource,
  setDiaryVisibility,
  startLastfm,
  uploadDiaryBatch,
} from "./actions";

const day = {
  day: "2026-10-01",
  key: "",
  artist: "Frank Ocean",
  album: "Blonde",
  songHint: "Nikes",
  songs: 5,
  minutes: 30,
  plays: 5,
};

beforeEach(() => {
  state.user = { id: "me", email: null };
  state.limited = new Set();
  state.host = "getmulo.com";
  state.keys = { key: "KEY", secret: "SECRET" };
  vi.clearAllMocks();
});

describe("startLastfm", () => {
  it("sends somebody signed out to log in, coming back to the import page", async () => {
    state.user = null;
    await expect(startLastfm()).rejects.toThrow("redirect:/login?next=%2Fdiary%2Fimport");
  });

  it("says so when Last.fm isn't set up", async () => {
    state.keys = null;
    expect(await startLastfm()).toEqual({ error: "Last.fm isn't set up yet." });
    expect(lib.createConnectState).not.toHaveBeenCalled();
  });

  it("is held to the write limit", async () => {
    state.limited.add("write");
    expect(await startLastfm()).toEqual({
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
  });

  it("goes off to Last.fm's approval page, coming back to this website", async () => {
    const error = await startLastfm().catch((thrown: Error) => thrown);
    expect(error).toBeInstanceOf(Error);
    const to = new URL((error as Error).message.replace("redirect:", ""));
    expect(to.origin + to.pathname).toBe("https://www.last.fm/api/auth/");
    expect(to.searchParams.get("cb")).toBe("https://getmulo.com/diary/lastfm/callback?state=STATE");
    expect(lib.createConnectState).toHaveBeenCalledWith("me", "web");
  });

  it("comes back to a website running on this computer over http", async () => {
    state.host = "localhost:3000";
    const error = (await startLastfm().catch((thrown: Error) => thrown)) as Error;
    const to = new URL(error.message.replace("redirect:", ""));
    expect(to.searchParams.get("cb")).toBe(
      "http://localhost:3000/diary/lastfm/callback?state=STATE",
    );
  });
});

describe("uploadDiaryBatch", () => {
  it("saves a batch", async () => {
    expect(await uploadDiaryBatch({ source: "spotify", days: [day] })).toEqual({
      ok: true,
      added: 3,
      merged: 0,
    });
    expect(lib.saveAlbumDays).toHaveBeenCalledWith("me", "spotify", [
      expect.objectContaining({ album: "Blonde" }),
    ]);
    expect(lib.finishImport).not.toHaveBeenCalled();
  });

  it("finishes the import with the last batch", async () => {
    await uploadDiaryBatch({ source: "spotify", days: [day], done: { total: 30 } });
    expect(lib.finishImport).toHaveBeenCalledWith("me", "spotify", 30);
  });

  it("doesn't finish when the last batch wasn't saved", async () => {
    lib.saveAlbumDays.mockResolvedValueOnce({ ok: false, error: "Nope." });
    expect(await uploadDiaryBatch({ source: "spotify", days: [day], done: { total: 30 } })).toEqual(
      { ok: false, error: "Nope." },
    );
    expect(lib.finishImport).not.toHaveBeenCalled();
  });

  it("refuses over the import limit, signed out, or a shape it can't read", async () => {
    state.limited.add("import");
    expect(await uploadDiaryBatch({ source: "spotify", days: [day] })).toEqual({
      ok: false,
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
    state.limited.clear();
    const many = Array.from({ length: 501 }, () => day);
    expect((await uploadDiaryBatch({ source: "spotify", days: many })).ok).toBe(false);
    expect((await uploadDiaryBatch({ source: "lastfm" as "spotify", days: [day] })).ok).toBe(false);
    state.user = null;
    expect(await uploadDiaryBatch({ source: "spotify", days: [day] })).toEqual({
      ok: false,
      error: "Log in first.",
    });
    expect(lib.saveAlbumDays).not.toHaveBeenCalled();
  });
});

describe("the diary's other actions", () => {
  it("act for whoever is signed in", async () => {
    expect(await deleteDiaryEntry(41)).toEqual({ ok: true });
    expect(lib.deleteEntry).toHaveBeenCalledWith("me", 41);
    expect(await removeDiarySource("lastfm", true)).toEqual({ ok: true });
    expect(lib.removeSource).toHaveBeenCalledWith("me", "lastfm", true);
    expect(await fixDiaryAlbum(41, MBID)).toEqual({ ok: true });
    expect(lib.fixAlbum).toHaveBeenCalledWith("me", 41, MBID);
    expect(await setDiaryVisibility(false)).toEqual({ ok: true });
    expect(lib.setDiaryPublic).toHaveBeenCalledWith("me", false);
    expect(await logDiaryListen(MBID, "2026-10-29", 8)).toEqual({ ok: true });
    expect(lib.logListen).toHaveBeenCalledWith("me", { mbid: MBID, day: "2026-10-29", score: 8 });
  });

  it("refuse somebody signed out, or over the write limit", async () => {
    state.user = null;
    expect((await deleteDiaryEntry(41)).ok).toBe(false);
    expect((await logDiaryListen(MBID, "2026-10-29")).ok).toBe(false);
    state.user = { id: "me", email: null };
    state.limited.add("write");
    expect((await setDiaryVisibility(true)).ok).toBe(false);
    expect((await logDiaryListen(MBID, "2026-10-29")).ok).toBe(false);
    expect(lib.deleteEntry).not.toHaveBeenCalled();
    expect(lib.setDiaryPublic).not.toHaveBeenCalled();
    expect(lib.logListen).not.toHaveBeenCalled();
  });

  it("refuse what isn't an id, a source or a score", async () => {
    expect((await deleteDiaryEntry(0)).ok).toBe(false);
    expect((await fixDiaryAlbum(-1, MBID)).ok).toBe(false);
    expect((await removeDiarySource("hand", false)).ok).toBe(false);
    expect((await logDiaryListen(MBID, "2026-10-29", 11)).ok).toBe(false);
    expect(lib.deleteEntry).not.toHaveBeenCalled();
    expect(lib.fixAlbum).not.toHaveBeenCalled();
    expect(lib.removeSource).not.toHaveBeenCalled();
    expect(lib.logListen).not.toHaveBeenCalled();
  });
});
