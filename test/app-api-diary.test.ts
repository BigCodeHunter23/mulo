import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The app API's diary endpoints. The diary's lib and Last.fm are stand-ins. */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: new Set<string>(),
  profile: null as { diary_public: boolean } | null,
}));

type Fn = (...args: unknown[]) => Promise<unknown>;

const lib = vi.hoisted(() => ({
  getDiaryPage: vi.fn<Fn>(async () => null),
  logListen: vi.fn<Fn>(async () => ({ ok: true })),
  saveAlbumDays: vi.fn<Fn>(async () => ({ ok: true, added: 3, merged: 1 })),
  finishImport: vi.fn<Fn>(async () => undefined),
  deleteEntry: vi.fn<Fn>(async () => ({ ok: true })),
  fixAlbum: vi.fn<Fn>(async () => ({ ok: true })),
  removeSource: vi.fn<Fn>(async () => ({ ok: true })),
  setDiaryPublic: vi.fn<Fn>(async () => ({ ok: true })),
  lastfmKeys: vi.fn<() => { key: string; secret: string } | null>(() => ({
    key: "KEY",
    secret: "SECRET",
  })),
  createConnectState: vi.fn<Fn>(async () => "STATE"),
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: caller.profile, error: null }) }),
      }),
    }),
  })),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async (bucket: string) => !caller.limited.has(bucket)),
  allowUser: vi.fn(async (bucket: string) => !caller.limited.has(bucket)),
}));
vi.mock("@/lib/diary/read", () => ({ getDiaryPage: lib.getDiaryPage }));
vi.mock("@/lib/diary/entries", async (original) => ({
  ...(await original<typeof import("@/lib/diary/entries")>()),
  logListen: lib.logListen,
  saveAlbumDays: lib.saveAlbumDays,
  finishImport: lib.finishImport,
  deleteEntry: lib.deleteEntry,
  fixAlbum: lib.fixAlbum,
  removeSource: lib.removeSource,
  setDiaryPublic: lib.setDiaryPublic,
}));
vi.mock("@/lib/diary/lastfm", async (original) => ({
  ...(await original<typeof import("@/lib/diary/lastfm")>()),
  lastfmKeys: lib.lastfmKeys,
  createConnectState: lib.createConnectState,
}));

import * as diaryOf from "@/app/api/app/v1/diary/[username]/route";
import * as entries from "@/app/api/app/v1/diary/entries/route";
import * as batch from "@/app/api/app/v1/diary/entries/batch/route";
import * as entry from "@/app/api/app/v1/diary/entries/[id]/route";
import * as entryAlbum from "@/app/api/app/v1/diary/entries/[id]/album/route";
import * as sources from "@/app/api/app/v1/diary/sources/[source]/route";
import * as lastfmStart from "@/app/api/app/v1/diary/lastfm/start/route";
import * as myDiary from "@/app/api/app/v1/me/diary/route";

const MBID = "f5093c06-23e3-404f-aeaa-40f72885ee3a";
const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const req = (method: string, body?: unknown, url = "https://mulo.test/api") =>
  new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const day = (n: number) => ({
  day: "2026-10-01",
  key: "",
  artist: "Frank Ocean",
  album: `Album ${n}`,
  songHint: null,
  songs: 5,
  minutes: 30,
  plays: 5,
});

beforeEach(() => {
  caller.token = "t";
  caller.user = { id: "me", email: null };
  caller.limited = new Set();
  caller.profile = null;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getmulo.com");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET diary/{username}", () => {
  it("is not found for nobody", async () => {
    const res = await diaryOf.GET(req("GET"), params({ username: "nobody" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "We couldn't find that person." });
  });

  it("answers a page, passing `before` on", async () => {
    const page = { state: "private", person: { username: "fran" } };
    lib.getDiaryPage.mockResolvedValueOnce(page);
    const res = await diaryOf.GET(
      req("GET", undefined, "https://mulo.test/api?before=2026-10-01.9"),
      params({ username: "fran" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(lib.getDiaryPage).toHaveBeenCalledWith("fran", "2026-10-01.9");
  });

  it("is open to visitors, within the read limit", async () => {
    caller.token = null;
    caller.user = null;
    lib.getDiaryPage.mockResolvedValueOnce({ state: "private", person: {} });
    expect((await diaryOf.GET(req("GET"), params({ username: "fran" }))).status).toBe(200);
    caller.limited.add("read");
    expect((await diaryOf.GET(req("GET"), params({ username: "fran" }))).status).toBe(429);
  });
});

describe("POST diary/entries", () => {
  it("logs a listen for whoever is signed in", async () => {
    const res = await entries.POST(req("POST", { mbid: MBID, day: "2026-10-29", score: 8 }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.logListen).toHaveBeenCalledWith("me", { mbid: MBID, day: "2026-10-29", score: 8 });
  });

  it("answers the lib's own words", async () => {
    lib.logListen.mockResolvedValueOnce({
      ok: false,
      error: "Open that album first, then try again.",
    });
    const res = await entries.POST(req("POST", { mbid: MBID, day: "2026-10-29" }));
    expect(await res.json()).toEqual({
      ok: false,
      error: "Open that album first, then try again.",
    });
  });

  it("refuses a shape it can't read", async () => {
    for (const body of [
      {},
      { mbid: MBID },
      { mbid: MBID, day: "2026-10-29", score: 11 },
      { mbid: MBID, day: "2026-10-29", score: 7.5 },
      { mbid: 7, day: "2026-10-29" },
    ]) {
      expect((await entries.POST(req("POST", body))).status).toBe(400);
    }
    expect(lib.logListen).not.toHaveBeenCalled();
  });

  it("needs somebody signed in, within the write limit", async () => {
    caller.token = null;
    caller.user = null;
    expect((await entries.POST(req("POST", { mbid: MBID, day: "2026-10-29" }))).status).toBe(401);
    caller.user = { id: "me", email: null };
    caller.limited.add("write");
    expect((await entries.POST(req("POST", { mbid: MBID, day: "2026-10-29" }))).status).toBe(429);
    expect(lib.logListen).not.toHaveBeenCalled();
  });
});

describe("POST diary/entries/batch", () => {
  it("saves a batch from the phone", async () => {
    const res = await batch.POST(req("POST", { source: "spotify", days: [day(1), day(2)] }));
    expect(await res.json()).toEqual({ ok: true, added: 3, merged: 1 });
    expect(lib.saveAlbumDays).toHaveBeenCalledWith("me", "spotify", [
      expect.objectContaining({ album: "Album 1" }),
      expect.objectContaining({ album: "Album 2" }),
    ]);
    expect(lib.finishImport).not.toHaveBeenCalled();
  });

  it("finishes the import after the last batch is saved", async () => {
    await batch.POST(req("POST", { source: "spotify", days: [day(1)], done: { total: 30 } }));
    expect(lib.finishImport).toHaveBeenCalledWith("me", "spotify", 30);
    expect(lib.saveAlbumDays.mock.invocationCallOrder[0]).toBeLessThan(
      lib.finishImport.mock.invocationCallOrder[0]!,
    );
  });

  it("doesn't finish an import whose last batch wasn't saved", async () => {
    lib.saveAlbumDays.mockResolvedValueOnce({ ok: false, error: "The diary isn't available yet." });
    const res = await batch.POST(
      req("POST", { source: "spotify", days: [day(1)], done: { total: 30 } }),
    );
    expect(await res.json()).toEqual({ ok: false, error: "The diary isn't available yet." });
    expect(lib.finishImport).not.toHaveBeenCalled();
  });

  it("refuses more than 500 days, and Last.fm, before saving anything", async () => {
    const many = Array.from({ length: 501 }, (_, i) => day(i));
    expect((await batch.POST(req("POST", { source: "spotify", days: many }))).status).toBe(400);
    expect((await batch.POST(req("POST", { source: "lastfm", days: [day(1)] }))).status).toBe(400);
    expect((await batch.POST(req("POST", { source: "hand", days: [day(1)] }))).status).toBe(400);
    expect(lib.saveAlbumDays).not.toHaveBeenCalled();
  });

  it("takes 500 days", async () => {
    const most = Array.from({ length: 500 }, (_, i) => day(i));
    expect((await batch.POST(req("POST", { source: "apple", days: most }))).status).toBe(200);
  });

  it("is held to the import limit", async () => {
    caller.limited.add("import");
    expect((await batch.POST(req("POST", { source: "spotify", days: [day(1)] }))).status).toBe(429);
    expect(lib.saveAlbumDays).not.toHaveBeenCalled();
  });
});

describe("DELETE diary/entries/{id}", () => {
  it("deletes one of yours", async () => {
    const res = await entry.DELETE(req("DELETE"), params({ id: "41" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.deleteEntry).toHaveBeenCalledWith("me", 41);
  });

  it("refuses an id that isn't one", async () => {
    for (const id of ["0", "x", "-3", "1.5"]) {
      expect((await entry.DELETE(req("DELETE"), params({ id }))).status).toBe(400);
    }
    expect(lib.deleteEntry).not.toHaveBeenCalled();
  });
});

describe("POST diary/entries/{id}/album", () => {
  it("points the entry's names at the album you chose", async () => {
    const res = await entryAlbum.POST(req("POST", { mbid: MBID }), params({ id: "41" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.fixAlbum).toHaveBeenCalledWith("me", 41, MBID);
  });

  it("refuses a bad id or body", async () => {
    expect((await entryAlbum.POST(req("POST", { mbid: MBID }), params({ id: "x" }))).status).toBe(
      400,
    );
    expect((await entryAlbum.POST(req("POST", {}), params({ id: "41" }))).status).toBe(400);
    expect(lib.fixAlbum).not.toHaveBeenCalled();
  });
});

describe("DELETE diary/sources/{source}", () => {
  it("removes a source and what it sent", async () => {
    const res = await sources.DELETE(req("DELETE"), params({ source: "spotify" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.removeSource).toHaveBeenCalledWith("me", "spotify", false);
  });

  it("only forgets the source with entries=keep", async () => {
    await sources.DELETE(
      req("DELETE", undefined, "https://mulo.test/api?entries=keep"),
      params({ source: "lastfm" }),
    );
    expect(lib.removeSource).toHaveBeenCalledWith("me", "lastfm", true);
  });

  it("knows no other source", async () => {
    for (const source of ["hand", "tidal"]) {
      expect((await sources.DELETE(req("DELETE"), params({ source }))).status).toBe(404);
    }
    expect(lib.removeSource).not.toHaveBeenCalled();
  });
});

describe("POST diary/lastfm/start", () => {
  it("answers Last.fm's approval page, coming back to the website with the state", async () => {
    const res = await lastfmStart.POST();
    const body = await res.json();
    expect(body.ok).toBe(true);
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe("https://www.last.fm/api/auth/");
    expect(url.searchParams.get("api_key")).toBe("KEY");
    expect(url.searchParams.get("cb")).toBe(
      "https://getmulo.com/diary/lastfm/callback?state=STATE&to=app",
    );
    expect(lib.createConnectState).toHaveBeenCalledWith("me", "app");
  });

  it("comes back to a preview deployment's own address", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "mulo-git-diary.vercel.app");
    const url = new URL((await (await lastfmStart.POST()).json()).url);
    expect(url.searchParams.get("cb")).toBe(
      "https://mulo-git-diary.vercel.app/diary/lastfm/callback?state=STATE&to=app",
    );
  });

  it("says so when Last.fm isn't set up", async () => {
    lib.lastfmKeys.mockReturnValueOnce(null);
    const res = await lastfmStart.POST();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Last.fm isn't set up yet." });
    expect(lib.createConnectState).not.toHaveBeenCalled();
  });

  it("needs somebody signed in", async () => {
    caller.token = null;
    caller.user = null;
    expect((await lastfmStart.POST()).status).toBe(401);
  });
});

describe("me/diary", () => {
  it("reads Show my diary from your profile, on until switched off", async () => {
    caller.profile = { diary_public: false };
    expect(await (await myDiary.GET()).json()).toEqual({ public: false });
    caller.profile = null;
    expect(await (await myDiary.GET()).json()).toEqual({ public: true });
  });

  it("switches it", async () => {
    const res = await myDiary.PATCH(req("PATCH", { public: false }));
    expect(await res.json()).toEqual({ ok: true });
    expect(lib.setDiaryPublic).toHaveBeenCalledWith("me", false);
  });

  it("refuses anything else", async () => {
    expect((await myDiary.PATCH(req("PATCH", { public: "no" }))).status).toBe(400);
    expect((await myDiary.PATCH(req("PATCH", { public: true, extra: 1 }))).status).toBe(400);
    expect(lib.setDiaryPublic).not.toHaveBeenCalled();
  });

  it("needs somebody signed in", async () => {
    caller.token = null;
    caller.user = null;
    expect((await myDiary.GET()).status).toBe(401);
    expect((await myDiary.PATCH(req("PATCH", { public: true }))).status).toBe(401);
  });
});
