import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getCurrentUser: vi.fn() }));

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  countFollowedArtists,
  getArtistFollowState,
  getArtistSuggestions,
  listFollowedArtists,
} from "@/lib/artist-follows";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "me", email: null });
});

describe("getArtistFollowState", () => {
  it("says whether you follow them, and how many do", async () => {
    fake.answer(
      "artist_follows",
      { count: 1204, data: null, error: null },
      { data: { user_id: "me" }, error: null },
    );
    expect(await getArtistFollowState(TYLER)).toEqual({ following: true, followers: 1204 });
  });

  it("only counts for somebody signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    fake.answer("artist_follows", { count: 7, data: null, error: null });
    expect(await getArtistFollowState(TYLER)).toEqual({ following: false, followers: 7 });
    expect(fake.callsOn("artist_follows").filter((c) => c.method === "from")).toHaveLength(1);
  });

  it("is nobody before migration 0026", async () => {
    fake.answer(
      "artist_follows",
      { count: null, data: null, error: { code: "42P01", message: "missing" } },
      { data: null, error: { code: "42P01", message: "missing" } },
    );
    expect(await getArtistFollowState(TYLER)).toEqual({ following: false, followers: 0 });
  });
});

describe("somebody's artists", () => {
  it("counts them", async () => {
    fake.answer("artist_follows", { count: 12, data: null, error: null });
    expect(await countFollowedArtists("u")).toBe(12);
  });

  it("lists them newest first, a slice at a time, with their photos", async () => {
    fake.answer("artist_follows", {
      data: [
        { artists: { mbid: TYLER, name: "Tyler, the Creator", image_url: "https://img/t.jpg" } },
        { artists: { mbid: "c", name: "Clipse", image_url: "" } },
      ],
      error: null,
    });
    expect(await listFollowedArtists("u", { offset: 50, size: 51 })).toEqual([
      { mbid: TYLER, name: "Tyler, the Creator", image_url: "https://img/t.jpg" },
      { mbid: "c", name: "Clipse", image_url: null },
    ]);
    expect(fake.callsOn("artist_follows")).toContainEqual({
      table: "artist_follows",
      method: "range",
      args: [50, 100],
    });
  });
});

describe("getArtistSuggestions", () => {
  it("answers the database's ranking, leaving out half-empty rows", async () => {
    fake.answer("rpc:artist_suggestions", {
      data: [
        { mbid: TYLER, name: "Tyler, the Creator", image_url: null },
        { mbid: null, name: null, image_url: null },
      ],
      error: null,
    });
    expect(await getArtistSuggestions()).toEqual([
      { mbid: TYLER, name: "Tyler, the Creator", image_url: null },
    ]);
    expect(fake.callsOn("rpc:artist_suggestions")[0]?.args).toEqual([
      "artist_suggestions",
      { p_limit: 12 },
    ]);
  });

  it("answers none when the database can't", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    fake.answer("rpc:artist_suggestions", {
      data: null,
      error: { code: "PGRST202", message: "x" },
    });
    expect(await getArtistSuggestions()).toEqual([]);
  });
});
