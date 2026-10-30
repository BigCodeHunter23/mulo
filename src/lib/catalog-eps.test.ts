import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

const mb = vi.hoisted(() => ({ getArtistReleaseGroups: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/musicbrainz", () => ({
  MbNotFoundError: class extends Error {},
  getArtist: vi.fn(),
  wikidataQid: () => null,
  seedFrom: () => ({}),
  coverArtUrl: (id: string) => `https://coverartarchive.org/release-group/${id}/front-500`,
  creditText: () => "Tyler, the Creator",
  getArtistReleaseGroups: mb.getArtistReleaseGroups,
  getReleaseGroup: vi.fn(),
  getTracklist: vi.fn(),
}));
vi.mock("@/lib/wikidata", () => ({ getArtistExtras: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  allowAddress: vi.fn(async () => true),
  RateLimitedError: class extends Error {},
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedArtistAlbums, getCachedArtistEps } from "@/lib/catalog";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const EP = "0c4c4e2c-5d0e-4e4e-9c4e-1f2a3b4c5d6e";
const row = {
  mbid: EP,
  title: "Cherry Bomb + Instrumentals",
  artist_mbid: TYLER,
  release_date: "2015-04-13",
  cover_art_url: "https://coverartarchive.org/release-group/x/front-500",
  genres: [],
};
const missingColumn = { code: "42703", message: "column does not exist" };

let reader: FakeSupabase;
let writer: FakeSupabase;
beforeEach(() => {
  reader = fakeSupabase();
  writer = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(reader.client as never);
  vi.mocked(createAdminClient).mockReturnValue(writer.client as never);
  mb.getArtistReleaseGroups.mockReset();
});

describe("an artist's EPs", () => {
  it("come from the cache once they've been read", async () => {
    reader.answer("artists", { data: { eps_cached_at: "2026-10-01T00:00:00Z" }, error: null });
    reader.answer("releases", { data: [row], error: null });
    expect(await getCachedArtistEps(TYLER)).toEqual([row]);
    expect(reader.callsOn("releases")).toContainEqual({
      table: "releases",
      method: "eq",
      args: ["kind", "ep"],
    });
    expect(mb.getArtistReleaseGroups).not.toHaveBeenCalled();
  });

  it("are read from MusicBrainz once, for an artist whose albums were cached before", async () => {
    reader.answer("artists", { data: { eps_cached_at: null }, error: null });
    reader.answer("releases", { data: [], error: null }, { data: [row], error: null });
    mb.getArtistReleaseGroups.mockResolvedValue([
      { id: EP, title: row.title, "first-release-date": "2015-04-13", "artist-credit": [] },
    ]);
    expect(await getCachedArtistEps(TYLER)).toEqual([row]);
    expect(mb.getArtistReleaseGroups).toHaveBeenCalledWith(TYLER, "ep");
    const upsert = writer.callsOn("releases").find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toEqual([
      expect.objectContaining({ mbid: EP, kind: "ep", artist_mbid: TYLER }),
    ]);
    expect(writer.callsOn("releases")).toContainEqual({
      table: "releases",
      method: "update",
      args: [{ kind: "ep" }],
    });
    expect(writer.callsOn("artists")).toContainEqual({
      table: "artists",
      method: "update",
      args: [{ eps_cached_at: expect.any(String) }],
    });
  });

  it("are asked for again next time when saving them fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = { code: "57014", message: "timeout" };
    for (const failing of ["upsert", "update"]) {
      writer = fakeSupabase();
      vi.mocked(createAdminClient).mockReturnValue(writer.client as never);
      reader.answer("artists", { data: { eps_cached_at: null }, error: null });
      reader.answer("releases", { data: [], error: null }, { data: [], error: null });
      writer.answer(
        "releases",
        failing === "upsert" ? { data: null, error: failure } : { data: null, error: null },
        failing === "update" ? { data: null, error: failure } : { data: null, error: null },
      );
      mb.getArtistReleaseGroups.mockResolvedValue([
        { id: EP, title: row.title, "first-release-date": "2015-04-13", "artist-credit": [] },
      ]);
      await getCachedArtistEps(TYLER);
      expect(writer.callsOn("artists")).toEqual([]);
    }
    spy.mockRestore();
  });

  it("are none before migration 0026, without asking MusicBrainz", async () => {
    reader.answer("artists", { data: null, error: missingColumn });
    reader.answer("releases", { data: null, error: missingColumn });
    expect(await getCachedArtistEps(TYLER)).toEqual([]);
    expect(mb.getArtistReleaseGroups).not.toHaveBeenCalled();
  });
});

describe("an artist's albums", () => {
  it("leave the EPs out", async () => {
    reader.answer("artists", { data: { albums_cached_at: "2026-10-01T00:00:00Z" }, error: null });
    reader.answer("releases", { data: [], error: null });
    await getCachedArtistAlbums(TYLER);
    expect(reader.callsOn("releases")).toContainEqual({
      table: "releases",
      method: "or",
      args: ["kind.is.null,kind.eq.album"],
    });
  });

  it("are every release before migration 0026", async () => {
    reader.answer("artists", { data: { albums_cached_at: "2026-10-01T00:00:00Z" }, error: null });
    reader.answer("releases", { data: null, error: missingColumn }, { data: [row], error: null });
    expect(await getCachedArtistAlbums(TYLER)).toEqual([row]);
  });
});
