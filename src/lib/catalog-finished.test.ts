import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";

const client = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client.current }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ allowAddress: vi.fn(), RateLimitedError: Error }));

import {
  readFinishedArtist,
  readFinishedRecords,
  readFinishedRelease,
  readFinishedTracks,
} from "@/lib/catalog";

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  client.current = fake.client;
});

const NOW = "2026-11-01T00:00:00Z";

describe("readFinishedRelease", () => {
  it("answers once the album's details are in", async () => {
    fake.answer("releases", { data: { mbid: MBID, title: "IGOR", details_cached_at: NOW } });
    expect((await readFinishedRelease(MBID))?.title).toBe("IGOR");
  });

  it("says nothing about one only listed on its artist's page", async () => {
    fake.answer("releases", { data: { mbid: MBID, title: "IGOR", details_cached_at: null } });
    expect(await readFinishedRelease(MBID)).toBeNull();
  });

  it("doesn't ask about something that isn't an album's id", async () => {
    expect(await readFinishedRelease("../../etc")).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});

describe("readFinishedArtist", () => {
  it("answers once the photo and the bio's source have been looked for", async () => {
    fake.answer("artists", { data: { mbid: MBID, name: "Queen", image_url: "", bio_url: "" } });
    expect(await readFinishedArtist(MBID)).toMatchObject({ name: "Queen", bio_url: null });
  });

  it.each([
    { image_url: null, bio_url: "" },
    { image_url: "", bio_url: null },
  ])("says nothing about one still to be looked up: %o", async (missing) => {
    fake.answer("artists", { data: { mbid: MBID, name: "Queen", ...missing } });
    expect(await readFinishedArtist(MBID)).toBeNull();
  });
});

describe("readFinishedTracks", () => {
  it("answers once the tracklist is final", async () => {
    fake.answer("releases", { data: { tracks_cached_at: NOW } });
    fake.answer("tracks", { data: [{ position: 1, title: "EARFQUAKE" }] });
    expect(await readFinishedTracks(MBID)).toEqual([{ position: 1, title: "EARFQUAKE" }]);
  });

  it("answers an album with no tracks as none, not as unfinished", async () => {
    fake.answer("releases", { data: { tracks_cached_at: NOW } });
    fake.answer("tracks", { data: null });
    expect(await readFinishedTracks(MBID)).toEqual([]);
  });

  it("says nothing about one that isn't final", async () => {
    fake.answer("releases", { data: { tracks_cached_at: null } });
    fake.answer("tracks", { data: [{ position: 1, title: "EARFQUAKE" }] });
    expect(await readFinishedTracks(MBID)).toBeNull();
  });
});

describe("readFinishedRecords", () => {
  const album = { mbid: "a", title: "A Night at the Opera" };
  const ep = { mbid: "e", title: "An EP" };

  it("answers once the albums and EPs have both been fetched", async () => {
    fake.answer(
      "artists",
      { data: { albums_cached_at: NOW } },
      { data: { eps_cached_at: NOW }, error: null },
    );
    fake.answer("releases", { data: [album], error: null }, { data: [ep], error: null });
    expect(await readFinishedRecords(MBID)).toEqual({ albums: [album], eps: [ep] });
  });

  it("says nothing while the albums haven't been fetched", async () => {
    fake.answer(
      "artists",
      { data: { albums_cached_at: null } },
      { data: { eps_cached_at: NOW }, error: null },
    );
    fake.answer("releases", { data: [album], error: null }, { data: [], error: null });
    expect(await readFinishedRecords(MBID)).toBeNull();
  });

  it("says nothing while the EPs haven't been fetched", async () => {
    fake.answer(
      "artists",
      { data: { albums_cached_at: NOW } },
      { data: { eps_cached_at: null }, error: null },
    );
    fake.answer("releases", { data: [album], error: null }, { data: [], error: null });
    expect(await readFinishedRecords(MBID)).toBeNull();
  });

  it("has no EPs until migration 0026 adds them, as the artist page already does", async () => {
    fake.answer(
      "artists",
      { data: { albums_cached_at: NOW } },
      { data: null, error: { code: "42703", message: "column eps_cached_at does not exist" } },
    );
    fake.answer("releases", { data: [album], error: null }, { data: [], error: null });
    expect(await readFinishedRecords(MBID)).toEqual({ albums: [album], eps: [] });
  });

  it("says nothing when the read itself failed", async () => {
    fake.answer(
      "artists",
      { data: { albums_cached_at: NOW } },
      { data: null, error: { code: "500", message: "boom" } },
    );
    fake.answer("releases", { data: [album], error: null }, { data: [], error: null });
    expect(await readFinishedRecords(MBID)).toBeNull();
  });
});
