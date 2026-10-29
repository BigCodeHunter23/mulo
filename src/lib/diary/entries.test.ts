import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumDay } from "@/lib/diary-shared";
import type { FakeSupabase } from "../../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.fake.client }));
const sendPushes = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("@/lib/push/send", () => ({ sendPushes }));
vi.mock("@/lib/push/later", () => ({ later: (task: () => Promise<unknown>) => void task() }));
const rate = vi.hoisted(() => vi.fn());
vi.mock("@/app/ratings/actions", () => ({ rate }));

import { fakeSupabase } from "../../../test/fake-supabase";
import {
  cleanDays,
  DIARY_FULL,
  DIARY_NOT_YET,
  deleteEntry,
  finishImport,
  fixAlbum,
  logListen,
  removeSource,
  saveAlbumDays,
  setDiaryPublic,
} from "./entries";

const MBID = "00000000-0000-4000-8000-0000000000aa";

const day = (overrides: Partial<AlbumDay> = {}): AlbumDay => ({
  day: "2026-10-12",
  key: "anything",
  artist: "Frank Ocean",
  album: "Blonde",
  songHint: "Nikes",
  songs: 5,
  minutes: 30,
  plays: 6,
  ...overrides,
});

beforeEach(() => {
  db.fake = fakeSupabase();
  sendPushes.mockClear();
  rate.mockReset();
});

describe("cleanDays", () => {
  it("works the key out itself, and drops days that don't count or can't be", () => {
    const now = Date.parse("2026-10-30T00:00:00Z");
    expect(
      cleanDays(
        [
          day({ key: "made|up" }),
          day({ songs: 1, minutes: 3 }),
          day({ day: "2099-01-01" }),
          day({ artist: "!!!", album: "?" }),
        ],
        now,
      ),
    ).toEqual([day({ key: "frank ocean|blonde" })]);
  });
});

describe("saveAlbumDays", () => {
  it("merges the days through the database and says what happened", async () => {
    db.fake.answer("diary_entries", { count: 10, error: null });
    db.fake.answer("rpc:diary_merge", { data: [{ added: 1, merged: 0 }], error: null });
    const result = await saveAlbumDays("u1", "spotify", [day({ key: "frank ocean|blonde" })]);
    expect(result).toEqual({ ok: true, added: 1, merged: 0 });
    expect(db.fake.callsOn("rpc:diary_merge")[0]?.args).toEqual([
      "diary_merge",
      {
        p_user: "u1",
        p_source: "spotify",
        p_entries: [expect.objectContaining({ key: "frank ocean|blonde", day: "2026-10-12" })],
      },
    ]);
  });

  it("asks nothing when no day counts", async () => {
    expect(await saveAlbumDays("u1", "spotify", [day({ songs: 0, minutes: 0 })])).toEqual({
      ok: true,
      added: 0,
      merged: 0,
    });
    expect(db.fake.calls).toEqual([]);
  });

  it("sends only what still fits", async () => {
    db.fake.answer("diary_entries", { count: 49_999, error: null });
    db.fake.answer("rpc:diary_merge", { data: [{ added: 1, merged: 0 }], error: null });
    await saveAlbumDays("u1", "spotify", [day(), day({ day: "2026-10-13" })]);
    const sent = db.fake.callsOn("rpc:diary_merge")[0]?.args[1] as { p_entries: unknown[] };
    expect(sent.p_entries).toHaveLength(1);
  });

  it("refuses once the diary is full", async () => {
    db.fake.answer("diary_entries", { count: 50_000, error: null });
    expect(await saveAlbumDays("u1", "spotify", [day()])).toEqual({ ok: false, error: DIARY_FULL });
    expect(db.fake.callsOn("rpc:diary_merge")).toEqual([]);
  });

  it("says the diary isn't available before migration 0025", async () => {
    db.fake.answer("diary_entries", { count: null, error: { code: "42P01", message: "missing" } });
    expect(await saveAlbumDays("u1", "spotify", [day()])).toEqual({
      ok: false,
      error: "The diary isn't available yet.",
    });
  });

  it("says so plainly when the merge fails", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    db.fake.answer("diary_entries", { count: 0, error: null });
    db.fake.answer("rpc:diary_merge", { data: null, error: { code: "57014", message: "slow" } });
    expect(await saveAlbumDays("u1", "spotify", [day()])).toEqual({
      ok: false,
      error: "Couldn't save that. Please try again.",
    });
  });
});

describe("finishImport", () => {
  it("records the import and pushes when enough albums came in", async () => {
    await finishImport("u1", "spotify", 25, new Date("2026-10-30T10:00:00Z"));
    expect(db.fake.callsOn("diary_sources")).toContainEqual({
      table: "diary_sources",
      method: "upsert",
      args: [
        {
          user_id: "u1",
          source: "spotify",
          last_import_at: "2026-10-30T10:00:00.000Z",
          last_count: 25,
          state: "idle",
        },
        { onConflict: "user_id,source" },
      ],
    });
    expect(sendPushes).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "u1",
        kind: "diary",
        key: "diary-import-spotify-2026-10-30",
        title: "Your Spotify history is in",
      }),
    ]);
  });

  it("stays quiet for a small upload, but always tells about Last.fm", async () => {
    await finishImport("u1", "spotify", 3);
    expect(sendPushes).not.toHaveBeenCalled();
    await finishImport("u1", "lastfm", 3);
    expect(sendPushes).toHaveBeenCalledTimes(1);
    // Last.fm's own state (syncing from here on) is the clock's to set.
    const upsert = db.fake.callsOn("diary_sources").filter((c) => c.method === "upsert")[1];
    expect(upsert?.args[0]).not.toHaveProperty("state");
  });

  it("stays quiet when nothing came in", async () => {
    await finishImport("u1", "lastfm", 0);
    expect(sendPushes).not.toHaveBeenCalled();
  });
});

describe("deleteEntry and removeSource", () => {
  it("deletes only your own entry, and says when there was none", async () => {
    db.fake.answer("diary_entries", { data: [{ id: 4 }], error: null }, { data: [], error: null });
    expect(await deleteEntry("u1", 4)).toEqual({ ok: true });
    expect(db.fake.callsOn("diary_entries")).toContainEqual({
      table: "diary_entries",
      method: "eq",
      args: ["user_id", "u1"],
    });
    expect(await deleteEntry("u1", 5)).toEqual({ ok: false, error: "Couldn't delete that entry." });
  });

  it("removes a source's entries, then forgets the source", async () => {
    db.fake.answer("rpc:diary_remove_source", { data: 12, error: null });
    expect(await removeSource("u1", "lastfm")).toEqual({ ok: true });
    expect(db.fake.callsOn("rpc:diary_remove_source")[0]?.args[1]).toEqual({
      p_user: "u1",
      p_source: "lastfm",
    });
    expect(db.fake.callsOn("diary_sources").map((c) => c.method)).toContain("delete");
  });

  it("can keep the entries, and says so before migration 0025", async () => {
    expect(await removeSource("u1", "spotify", true)).toEqual({ ok: true });
    expect(db.fake.callsOn("rpc:diary_remove_source")).toEqual([]);
    db.fake.answer("rpc:diary_remove_source", {
      data: null,
      error: { code: "PGRST202", message: "" },
    });
    expect(await removeSource("u1", "spotify")).toEqual({ ok: false, error: DIARY_NOT_YET });
  });
});

describe("fixAlbum", () => {
  it("points every entry with those names at the album chosen, as fixed", async () => {
    db.fake.answer("diary_entries", { data: { album_key: "frank ocean|blonde" }, error: null });
    db.fake.answer("releases", { data: { mbid: MBID }, error: null });
    expect(await fixAlbum("u1", 4, MBID)).toEqual({ ok: true });
    const calls = db.fake.callsOn("diary_entries");
    expect(calls).toContainEqual({
      table: "diary_entries",
      method: "update",
      args: [{ release_mbid: MBID, fixed: true }],
    });
    expect(calls).toContainEqual({
      table: "diary_entries",
      method: "eq",
      args: ["album_key", "frank ocean|blonde"],
    });
    expect(db.fake.callsOn("album_matches")).toEqual([]);
  });

  it("needs the album in the catalogue, and your own entry", async () => {
    db.fake.answer("diary_entries", { data: { album_key: "k|k" }, error: null });
    expect(await fixAlbum("u1", 4, MBID)).toEqual({
      ok: false,
      error: "Open that album first, then try again.",
    });
    db.fake.answer("releases", { data: { mbid: MBID }, error: null });
    expect(await fixAlbum("u1", 4, MBID)).toEqual({
      ok: false,
      error: "We couldn't find that entry.",
    });
    expect((await fixAlbum("u1", 4, "not-an-id")).ok).toBe(false);
  });
});

describe("setDiaryPublic", () => {
  it("switches the diary on the profile, and says so before migration 0025", async () => {
    expect(await setDiaryPublic("u1", false)).toEqual({ ok: true });
    expect(db.fake.callsOn("profiles")).toContainEqual({
      table: "profiles",
      method: "update",
      args: [{ diary_public: false }],
    });
    db.fake.answer("profiles", { error: { code: "PGRST204", message: "no column" } });
    expect(await setDiaryPublic("u1", true)).toEqual({ ok: false, error: DIARY_NOT_YET });
  });
});

describe("logListen", () => {
  const release = { mbid: MBID, title: "Blonde", artist_credit: "Frank Ocean", artists: null };

  it("saves an album on a day by hand, already matched", async () => {
    db.fake.answer("releases", { data: release, error: null });
    db.fake.answer("diary_entries", { count: 0, error: null });
    db.fake.answer("rpc:diary_merge", { data: [{ added: 1, merged: 0 }], error: null });
    expect(await logListen("u1", { mbid: MBID, day: "2026-10-12" })).toEqual({ ok: true });
    expect(rate).not.toHaveBeenCalled();
    expect(db.fake.callsOn("rpc:diary_merge")[0]?.args[1]).toEqual({
      p_user: "u1",
      p_source: "hand",
      p_entries: [
        expect.objectContaining({
          day: "2026-10-12",
          key: "frank ocean|blonde",
          artist: "Frank Ocean",
          album: "Blonde",
          mbid: MBID,
        }),
      ],
    });
  });

  it("saves the score as an ordinary rating first", async () => {
    db.fake.answer("releases", {
      data: { ...release, artists: { name: "Frank Ocean" } },
      error: null,
    });
    db.fake.answer("diary_entries", { count: 0, error: null });
    db.fake.answer("rpc:diary_merge", { data: [{ added: 1, merged: 0 }], error: null });
    rate.mockResolvedValueOnce({ ok: true });
    expect(await logListen("u1", { mbid: MBID, day: "2026-10-12", score: 8 })).toEqual({
      ok: true,
    });
    expect(rate).toHaveBeenCalledWith("album", MBID, 8);
  });

  it("stops when the score won't save", async () => {
    db.fake.answer("releases", { data: release, error: null });
    rate.mockResolvedValueOnce({ ok: false, error: "Scores run from 1 to 10." });
    expect(await logListen("u1", { mbid: MBID, day: "2026-10-12", score: 11 })).toEqual({
      ok: false,
      error: "Scores run from 1 to 10.",
    });
    expect(db.fake.callsOn("rpc:diary_merge")).toEqual([]);
  });

  it("needs the album in the catalogue and a real day", async () => {
    expect(await logListen("u1", { mbid: MBID, day: "2026-10-12" })).toEqual({
      ok: false,
      error: "Open that album first, then try again.",
    });
    expect(await logListen("u1", { mbid: MBID, day: "2099-01-01" })).toEqual({
      ok: false,
      error: "Pick a day from 1900 up to today.",
    });
    expect(await logListen("u1", { mbid: MBID, day: "1899-12-31" })).toEqual({
      ok: false,
      error: "Pick a day from 1900 up to today.",
    });
  });
});
