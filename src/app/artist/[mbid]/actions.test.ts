import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../../../test/fake-supabase";

const me = vi.hoisted(() => ({
  user: { id: "me", email: null } as { id: string; email: string | null } | null,
  allowed: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(async () => me.user),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowUser: vi.fn(async () => me.allowed),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ getCachedArtist: vi.fn() }));
vi.mock("@/lib/artist-follows", () => ({
  countFollowedArtists: vi.fn(),
  getArtistSuggestions: vi.fn(),
}));
vi.mock("@/lib/social", () => ({ getUsername: vi.fn(async () => "fan") }));

import { createClient } from "@/lib/supabase/server";
import { getCachedArtist } from "@/lib/catalog";
import { countFollowedArtists, getArtistSuggestions } from "@/lib/artist-follows";
import { ARTISTS_FULL } from "@/lib/artist-follows-shared";
import { artistSuggestions, followArtists, setArtistFollowing } from "./actions";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const NAS = "cfbc0924-0035-4d6c-8197-f024653af823";

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  me.user = { id: "me", email: null };
  me.allowed = true;
  vi.mocked(countFollowedArtists).mockResolvedValue(3);
});

const inserted = () => fake.callsOn("artist_follows").find((c) => c.method === "insert")?.args;

describe("setArtistFollowing", () => {
  it("follows an artist MULO has, and says when it's their first", async () => {
    fake.answer("artists", { data: { mbid: TYLER }, error: null });
    vi.mocked(countFollowedArtists).mockResolvedValue(1);
    expect(await setArtistFollowing(TYLER, true)).toEqual({ ok: true, first: true });
    expect(inserted()).toEqual([{ user_id: "me", artist_mbid: TYLER }]);
    expect(getCachedArtist).not.toHaveBeenCalled();
  });

  it("caches an artist it hasn't got before following them", async () => {
    fake.answer("artists", { data: null, error: null });
    vi.mocked(getCachedArtist).mockResolvedValue({
      mbid: TYLER,
      name: "Tyler, the Creator",
      image_url: null,
      bio: null,
      bio_url: null,
    });
    expect(await setArtistFollowing(TYLER, true)).toEqual({ ok: true });
    expect(getCachedArtist).toHaveBeenCalledWith(TYLER);
    expect(inserted()).toBeDefined();
  });

  it("says so for an artist MusicBrainz doesn't have", async () => {
    fake.answer("artists", { data: null, error: null });
    vi.mocked(getCachedArtist).mockResolvedValue(null);
    expect(await setArtistFollowing(TYLER, true)).toEqual({
      ok: false,
      error: "We couldn't find that artist.",
    });
    expect(inserted()).toBeUndefined();
  });

  it("takes following twice in its stride, and never calls it a first", async () => {
    fake.answer("artists", { data: { mbid: TYLER }, error: null });
    fake.answer("artist_follows", { data: null, error: { code: "23505", message: "duplicate" } });
    expect(await setArtistFollowing(TYLER, true)).toEqual({ ok: true });
    expect(countFollowedArtists).not.toHaveBeenCalled();
  });

  it("says so at 2,000 artists", async () => {
    fake.answer("artists", { data: { mbid: TYLER }, error: null });
    fake.answer("artist_follows", {
      data: null,
      error: { code: "23514", message: "artist follows full" },
    });
    expect(await setArtistFollowing(TYLER, true)).toEqual({ ok: false, error: ARTISTS_FULL });
  });

  it("unfollows", async () => {
    expect(await setArtistFollowing(TYLER, false)).toEqual({ ok: true });
    const calls = fake.callsOn("artist_follows");
    expect(calls).toContainEqual({ table: "artist_follows", method: "delete", args: [] });
    expect(calls).toContainEqual({
      table: "artist_follows",
      method: "eq",
      args: ["user_id", "me"],
    });
  });
});

describe("followArtists", () => {
  it("follows the ones MULO has, skipping any already followed", async () => {
    fake.answer("artists", { data: [{ mbid: TYLER }], error: null });
    expect(await followArtists([TYLER, NAS])).toEqual({ ok: true });
    expect(fake.callsOn("artist_follows").find((c) => c.method === "upsert")?.args).toEqual([
      [{ user_id: "me", artist_mbid: TYLER }],
      { onConflict: "user_id,artist_mbid", ignoreDuplicates: true },
    ]);
  });

  it("takes one to twelve artist ids, and nothing else", async () => {
    expect((await followArtists([])).ok).toBe(false);
    expect((await followArtists(Array.from({ length: 13 }, () => TYLER))).ok).toBe(false);
    expect((await followArtists(["nope"])).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("says so at 2,000 artists", async () => {
    fake.answer("artists", { data: [{ mbid: TYLER }], error: null });
    fake.answer(
      "artist_follows",
      { data: [], error: null },
      { data: null, error: { code: "23514", message: "full" } },
    );
    expect(await followArtists([TYLER])).toEqual({ ok: false, error: ARTISTS_FULL });
  });

  it("adds only the ones not followed yet, so the limit isn't reached by those", async () => {
    fake.answer("artists", { data: [{ mbid: TYLER }, { mbid: NAS }], error: null });
    fake.answer("artist_follows", { data: [{ artist_mbid: TYLER }], error: null });
    expect(await followArtists([TYLER, NAS])).toEqual({ ok: true });
    const read = fake.callsOn("artist_follows");
    expect(read).toContainEqual({ table: "artist_follows", method: "eq", args: ["user_id", "me"] });
    expect(read).toContainEqual({
      table: "artist_follows",
      method: "in",
      args: ["artist_mbid", [TYLER, NAS]],
    });
    expect(read.find((c) => c.method === "upsert")?.args[0]).toEqual([
      { user_id: "me", artist_mbid: NAS },
    ]);
  });

  it("is done at once when every one is followed already", async () => {
    fake.answer("artists", { data: [{ mbid: TYLER }], error: null });
    fake.answer("artist_follows", { data: [{ artist_mbid: TYLER }], error: null });
    expect(await followArtists([TYLER])).toEqual({ ok: true });
    expect(fake.callsOn("artist_follows").some((c) => c.method === "upsert")).toBe(false);
  });

  it("tries nothing when reading the follows fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.answer("artists", { data: [{ mbid: TYLER }], error: null });
    fake.answer("artist_follows", { data: null, error: { code: "57014", message: "timeout" } });
    expect((await followArtists([TYLER])).ok).toBe(false);
    expect(fake.callsOn("artist_follows").some((c) => c.method === "upsert")).toBe(false);
    spy.mockRestore();
  });
});

describe("artistSuggestions", () => {
  it("is nobody's signed out, and the ranking signed in", async () => {
    me.user = null;
    expect(await artistSuggestions()).toEqual([]);
    me.user = { id: "me", email: null };
    vi.mocked(getArtistSuggestions).mockResolvedValue([
      { mbid: TYLER, name: "Tyler, the Creator", image_url: null },
    ]);
    expect(await artistSuggestions()).toEqual([
      { mbid: TYLER, name: "Tyler, the Creator", image_url: null },
    ]);
  });
});
