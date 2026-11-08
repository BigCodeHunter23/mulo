import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

const store = vi.hoisted(() => new Map<string, string>());
const catalog = vi.hoisted(() => ({
  readFinishedArtist: vi.fn(),
  readFinishedRecords: vi.fn(),
  readFinishedRelease: vi.fn(),
  readFinishedTracks: vi.fn(),
  getCachedArtist: vi.fn(),
  getCachedArtistAlbums: vi.fn(),
  getCachedArtistEps: vi.fn(),
  getCachedRelease: vi.fn(),
  getCachedTracks: vi.fn(),
}));
const ratings = vi.hoisted(() => ({
  getScoresForReleases: vi.fn(),
  getScores: vi.fn(),
  getSongScores: vi.fn(),
  getTopSongs: vi.fn(),
}));

// What's kept comes back through JSON, as it does from the real one.
vi.mock("next/cache", () => ({
  unstable_cache:
    (read: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      const kept = store.get(key);
      if (kept !== undefined) return JSON.parse(kept);
      const value = await read(...args);
      store.set(key, JSON.stringify(value));
      return value;
    },
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/ratings", () => ratings);
vi.mock("@/lib/artist-follows", () => ({ getArtistFollowState: vi.fn() }));
vi.mock("@/lib/reactions", () => ({ getReactions: vi.fn() }));
vi.mock("@/lib/reviews", () => ({ getReviews: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn() }));

import { createPublicClient } from "@/lib/supabase/public";
import { albumHeadline, artistHeadline, recordScores, recordsFor } from "./page-reads";

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";

let fake: FakeSupabase;
beforeEach(() => {
  store.clear();
  vi.resetAllMocks();
  fake = fakeSupabase();
  vi.mocked(createPublicClient).mockReturnValue(fake.client as never);
});

describe("artistHeadline", () => {
  it("uses the kept artist once it's finished, with no read of its own", async () => {
    catalog.readFinishedArtist.mockResolvedValue({ name: "Queen", bio: "A band." });
    expect(await artistHeadline(MBID)).toMatchObject({ name: "Queen", bio: "A band." });
    expect(fake.calls).toEqual([]);
  });

  it("reads an unfinished artist live, so a missing bio isn't kept for a day", async () => {
    catalog.readFinishedArtist.mockResolvedValue(null);
    fake.answer(
      "artists",
      { data: { name: "Queen", bio: null } },
      { data: { name: "Queen", bio: "A band." } },
    );
    expect((await artistHeadline(MBID))?.bio).toBeNull();
    expect((await artistHeadline(MBID))?.bio).toBe("A band.");
  });

  it("doesn't ask about something that isn't an artist's id", async () => {
    catalog.readFinishedArtist.mockResolvedValue(null);
    expect(await artistHeadline("not-an-id")).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});

describe("albumHeadline", () => {
  const titled = (artists: { name: string } | null) => ({
    data: { title: "Jazz", release_date: "1978-11-10", artists },
  });

  it("keeps the headline once its artist is known", async () => {
    fake.answer("releases", titled({ name: "Queen" }));
    await albumHeadline(MBID);
    expect((await albumHeadline(MBID))?.artists?.name).toBe("Queen");
    expect(fake.calls.filter((call) => call.method === "from")).toHaveLength(1);
  });

  it("doesn't keep one without its artist, who may arrive with this very visit", async () => {
    fake.answer("releases", titled(null), titled(null), titled({ name: "Queen" }));
    expect((await albumHeadline(MBID))?.artists).toBeNull();
    expect((await albumHeadline(MBID))?.artists?.name).toBe("Queen");
  });

  it("doesn't ask about something that isn't an album's id", async () => {
    expect(await albumHeadline("not-an-id")).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});

describe("recordScores", () => {
  it("still reads as pairs once it's been kept", async () => {
    ratings.getScoresForReleases.mockResolvedValue(new Map([["a", 7.5]]));
    await recordScores(false, ["a"]);
    expect(new Map(await recordScores(false, ["a"])).get("a")).toBe(7.5);
    expect(ratings.getScoresForReleases).toHaveBeenCalledOnce();
  });
});

describe("recordsFor", () => {
  const records = { albums: [{ mbid: "a" }], eps: [] };

  it("shares a finished discography between signed-out visitors", async () => {
    catalog.readFinishedRecords.mockResolvedValue(records);
    expect(await recordsFor(false, MBID)).toEqual(records);
    expect(catalog.getCachedArtistAlbums).not.toHaveBeenCalled();
  });

  it("goes the long way round for one that isn't finished", async () => {
    catalog.readFinishedRecords.mockResolvedValue(null);
    catalog.getCachedArtistAlbums.mockResolvedValue(records.albums);
    catalog.getCachedArtistEps.mockResolvedValue([]);
    expect(await recordsFor(false, MBID)).toEqual(records);
  });

  it("reads live for somebody signed in", async () => {
    catalog.getCachedArtistAlbums.mockResolvedValue(records.albums);
    catalog.getCachedArtistEps.mockResolvedValue([]);
    expect(await recordsFor(true, MBID)).toEqual(records);
    expect(catalog.readFinishedRecords).not.toHaveBeenCalled();
  });
});
