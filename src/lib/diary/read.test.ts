import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const db = vi.hoisted(() => ({
  /** The visitor's own client: row-level security decides what it reads. */
  fake: null as unknown as FakeSupabase,
  /** The service role, for the owner's private tables. */
  admin: null as unknown as FakeSupabase,
  user: null as { id: string; email: string | null } | null,
  hidden: new Set<string>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => db.user,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/blocks", () => ({ hiddenPeople: async () => db.hidden }));
vi.mock("@/lib/supabase/errors", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/errors")>()),
  logQueryError: vi.fn(),
}));

import { fakeSupabase } from "../../../test/fake-supabase";
import {
  diaryCopyOf,
  getDiaryPage,
  getOwnDiary,
  PAGE_SIZE,
  parseCursor,
  recentListening,
} from "./read";

const OWNER = {
  id: "fran-id",
  username: "fran",
  display_name: "Fran",
  avatar_url: null,
  diary_public: true,
};
const PERSON = { id: "fran-id", username: "fran", display_name: "Fran", avatar_url: null };
const BLONDE = "00000000-0000-4000-8000-0000000000aa";

const entry = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  day: "2026-10-12",
  artist_name: "Frank Ocean",
  album_name: "Blonde",
  album_key: "frank ocean|blonde",
  release_mbid: BLONDE,
  sources: ["lastfm"],
  songs: 6,
  minutes: 40,
  plays: 7,
  releases: {
    mbid: BLONDE,
    title: "Blonde",
    cover_art_url: "https://covers/blonde.jpg",
    artist_credit: "Frank Ocean",
  },
  ...overrides,
});

const unmatched = (id: number) =>
  entry(id, {
    artist_name: "Nobody",
    album_name: "Unknown",
    album_key: "nobody|unknown",
    release_mbid: null,
    sources: ["spotify"],
    releases: null,
  });

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
  db.user = { id: "someone-else", email: null };
  db.hidden = new Set();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDiaryPage", () => {
  it("is null for nobody by that name, or a name that can't be one", async () => {
    expect(await getDiaryPage("nobody", null)).toBeNull();
    expect(await getDiaryPage("a%b", null)).toBeNull();
  });

  it("is null for somebody hidden either way", async () => {
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.hidden = new Set([OWNER.id]);
    expect(await getDiaryPage("fran", null)).toBeNull();
  });

  it("looks the name up whatever its case, escaping underscores", async () => {
    await getDiaryPage("fran_k", null);
    expect(db.fake.callsOn("profiles")).toContainEqual({
      table: "profiles",
      method: "ilike",
      args: ["username", "fran\\_k"],
    });
  });

  it("says a diary kept private is private, to anybody else", async () => {
    db.fake.answer("profiles", { data: { ...OWNER, diary_public: false }, error: null });
    expect(await getDiaryPage("fran", null)).toEqual({ state: "private", person: PERSON });
    expect(db.fake.callsOn("diary_entries")).toEqual([]);
  });

  it("reads somebody else's open diary, without what only they see", async () => {
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.fake.answer("diary_entries", { data: [entry(41), unmatched(40)], error: null });
    db.fake.answer("ratings", { data: [{ release_mbid: BLONDE, score: 9 }], error: null });
    db.fake.answer("rpc:diary_months", {
      data: [{ month: "2026-10", albums: 2, minutes: 80 }],
      error: null,
    });
    db.admin.answer("album_matches", { data: [{ album_key: "nobody|unknown", tries: 1 }] });

    expect(await getDiaryPage("fran", null)).toEqual({
      state: "open",
      person: PERSON,
      entries: [
        {
          id: 41,
          day: "2026-10-12",
          artist: "Frank Ocean",
          album: "Blonde",
          release: {
            mbid: BLONDE,
            title: "Blonde",
            cover: "https://covers/blonde.jpg",
            artist: "Frank Ocean",
          },
          matching: "matched",
          score: 9,
          sources: ["lastfm"],
          songs: 6,
          minutes: 40,
          plays: 7,
        },
        {
          id: 40,
          day: "2026-10-12",
          artist: "Nobody",
          album: "Unknown",
          release: null,
          matching: "pending",
          score: null,
          sources: ["spotify"],
          songs: 6,
          minutes: 40,
          plays: 7,
        },
      ],
      months: [{ month: "2026-10", albums: 2, minutes: 80 }],
      next: null,
      own: null,
    });
    // The owner's scores, read through the visitor's own session.
    expect(db.fake.callsOn("ratings")).toContainEqual({
      table: "ratings",
      method: "eq",
      args: ["user_id", OWNER.id],
    });
    expect(db.fake.callsOn("rpc:diary_months")[0]?.args[1]).toEqual({
      p_user: OWNER.id,
      p_from: "2026-10-01",
      p_to: "2026-10-12",
    });
    expect(db.admin.callsOn("diary_sources")).toEqual([]);
  });

  it("gives the owner their sources, what's waiting and the switch, never the session", async () => {
    vi.stubEnv("LASTFM_API_KEY", "KEY");
    vi.stubEnv("LASTFM_API_SECRET", "SECRET");
    db.user = { id: OWNER.id, email: null };
    db.fake.answer("profiles", { data: { ...OWNER, diary_public: false }, error: null });
    db.fake.answer("diary_entries", { data: [], error: null });
    db.fake.answer("rpc:diary_waiting", { data: 3, error: null });
    db.admin.answer("diary_sources", {
      data: [
        {
          source: "lastfm",
          state: "importing",
          lastfm_user: "franlistens",
          reached_back: "2020-01-01T00:00:00Z",
          synced_to: "2026-10-30T09:00:00Z",
          last_import_at: null,
          last_count: null,
        },
      ],
      error: null,
    });

    const page = await getDiaryPage("fran", null);
    expect(page).toEqual({
      state: "open",
      person: PERSON,
      entries: [],
      months: [],
      next: null,
      own: {
        public: false,
        sources: [
          {
            source: "lastfm",
            state: "importing",
            lastfmUser: "franlistens",
            reachedBack: "2020-01-01T00:00:00Z",
            syncedAt: "2026-10-30T09:00:00Z",
            lastImportAt: null,
            lastCount: null,
          },
        ],
        waiting: 3,
        lastfm: true,
      },
    });
    const selected = String(
      db.admin.callsOn("diary_sources").find((c) => c.method === "select")?.args[0],
    );
    expect(selected).not.toContain("session");
    expect(selected).not.toContain("pending");
    expect(db.admin.callsOn("diary_sources")).toContainEqual({
      table: "diary_sources",
      method: "eq",
      args: ["user_id", OWNER.id],
    });
  });

  it("says Last.fm can't be connected without the website's keys", async () => {
    vi.stubEnv("LASTFM_API_KEY", "");
    db.user = { id: OWNER.id, email: null };
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.fake.answer("diary_entries", { data: [], error: null });
    const page = await getDiaryPage("fran", null);
    expect(page?.state === "open" && page.own?.lastfm).toBe(false);
  });

  it("pages sixty at a time, with the next page's cursor", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
      entry(1000 - i, { day: `2026-10-${String(30 - Math.floor(i / 3)).padStart(2, "0")}` }),
    );
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.fake.answer("diary_entries", { data: rows, error: null });
    const page = await getDiaryPage("fran", null);
    if (page?.state !== "open") throw new Error("expected an open diary");
    expect(page.entries).toHaveLength(PAGE_SIZE);
    const last = rows[PAGE_SIZE - 1]!;
    expect(page.next).toBe(`${last.day}.${last.id}`);
    expect(db.fake.callsOn("diary_entries")).toContainEqual({
      table: "diary_entries",
      method: "limit",
      args: [PAGE_SIZE + 1],
    });
  });

  it("reads on from a cursor", async () => {
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.fake.answer("diary_entries", { data: [], error: null });
    await getDiaryPage("fran", "2026-10-12.41");
    expect(db.fake.callsOn("diary_entries")).toContainEqual({
      table: "diary_entries",
      method: "or",
      args: ["day.lt.2026-10-12,and(day.eq.2026-10-12,id.lt.41)"],
    });
  });

  it("says the diary isn't available before migration 0025", async () => {
    db.fake.answer(
      "profiles",
      { data: null, error: { code: "42703", message: "no diary_public" } },
      { data: PERSON, error: null },
    );
    db.fake.answer("diary_entries", { data: null, error: { code: "42P01", message: "missing" } });
    expect(await getDiaryPage("fran", null)).toEqual({ state: "unavailable", person: PERSON });
  });

  it("says when matching has given up on a name", async () => {
    db.fake.answer("profiles", { data: OWNER, error: null });
    db.fake.answer("diary_entries", { data: [unmatched(40)], error: null });
    db.admin.answer("album_matches", { data: [{ album_key: "nobody|unknown", tries: 3 }] });
    const page = await getDiaryPage("fran", null);
    expect(page?.state === "open" && page.entries[0]?.matching).toBe("none");
  });
});

describe("getOwnDiary", () => {
  it("gives your own switch and sources, for the import page", async () => {
    vi.stubEnv("LASTFM_API_KEY", "");
    db.fake.answer("profiles", { data: { diary_public: false }, error: null });
    db.admin.answer("diary_sources", {
      data: [
        {
          source: "spotify",
          state: "idle",
          lastfm_user: null,
          reached_back: null,
          synced_to: null,
          last_import_at: "2026-10-30T09:00:00Z",
          last_count: 12,
        },
      ],
      error: null,
    });
    expect(await getOwnDiary(OWNER.id)).toEqual({
      public: false,
      sources: [
        {
          source: "spotify",
          state: "idle",
          lastfmUser: null,
          reachedBack: null,
          syncedAt: null,
          lastImportAt: "2026-10-30T09:00:00Z",
          lastCount: 12,
        },
      ],
      waiting: 0,
      lastfm: false,
    });
    expect(db.fake.callsOn("profiles")).toContainEqual({
      table: "profiles",
      method: "eq",
      args: ["id", OWNER.id],
    });
  });

  it("is null before migration 0025", async () => {
    db.fake.answer("profiles", {
      data: null,
      error: { code: "42703", message: "no diary_public" },
    });
    expect(await getOwnDiary(OWNER.id)).toBeNull();
  });
});

describe("parseCursor", () => {
  it("reads a day and an id, and nothing else", () => {
    expect(parseCursor("2026-10-12.41")).toEqual({ day: "2026-10-12", id: 41 });
    expect(parseCursor("junk")).toBeNull();
    expect(parseCursor("2026-02-30.4")).toBeNull();
    expect(parseCursor(null)).toBeNull();
  });
});

describe("recentListening", () => {
  it("reads the latest matched entries, as the viewer may see them", async () => {
    db.fake.answer("diary_entries", { data: [entry(41)], error: null });
    const entries = await recentListening(OWNER.id);
    expect(entries.map((e) => e.id)).toEqual([41]);
    expect(db.fake.callsOn("diary_entries")).toContainEqual({
      table: "diary_entries",
      method: "not",
      args: ["release_mbid", "is", null],
    });
    expect(db.fake.callsOn("diary_entries")).toContainEqual({
      table: "diary_entries",
      method: "limit",
      args: [8],
    });
  });

  it("is empty before migration 0025", async () => {
    db.fake.answer("diary_entries", { data: null, error: { code: "42P01", message: "missing" } });
    expect(await recentListening(OWNER.id)).toEqual([]);
  });
});

describe("diaryCopyOf", () => {
  it("copies every entry, a thousand at a time, and the sources without the session", async () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => ({ day: "2026-10-12", id: i }));
    db.admin.answer("diary_entries", { data: thousand, error: null }, { data: [{ id: 1 }] });
    db.admin.answer("diary_sources", { data: [{ source: "spotify" }], error: null });
    const copy = await diaryCopyOf(OWNER.id);
    expect(copy.entries).toHaveLength(1001);
    expect(copy.sources).toEqual([{ source: "spotify" }]);
    const ranges = db.admin.callsOn("diary_entries").filter((c) => c.method === "range");
    expect(ranges.map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    const selected = String(
      db.admin.callsOn("diary_sources").find((c) => c.method === "select")?.args[0],
    );
    expect(selected).not.toContain("session");
  });
});
