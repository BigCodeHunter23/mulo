import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: <T>(run: T) => run }));

import { createPublicClient } from "@/lib/supabase/public";
import { similarArtists } from "@/lib/discover";

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const person = (n: number) => ({
  mbid: `artist-${n}`,
  name: `Artist ${n}`,
  image_url: `https://img.test/${n}`,
  popularity: 100 - n,
});

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createPublicClient).mockReturnValue(fake.client as never);
});

describe("similarArtists", () => {
  it("reads one page of neighbours, not thousands of rows on every album and artist page", async () => {
    fake.answer(
      "releases",
      { data: [{ genres: ["rock"] }] },
      {
        data: [1, 2, 3].map((n) => ({ artist_mbid: `artist-${n}`, genres: ["rock"] })),
        error: null,
      },
    );
    fake.answer("artists", { data: [1, 2, 3].map(person) });

    const artists = await similarArtists(MBID, 3);

    expect(artists).toHaveLength(3);
    const ranges = fake.calls.filter(
      (call) => call.table === "releases" && call.method === "range",
    );
    expect(ranges).toEqual([{ table: "releases", method: "range", args: [0, 499] }]);
  });

  it("reads any casing of an id as the same artist, so it can't pad out what's kept", async () => {
    fake.answer("releases", { data: [] });
    fake.answer("artists", { data: [] });
    await similarArtists(MBID.toUpperCase(), 3);
    const asked = fake.calls.find((call) => call.table === "releases" && call.method === "eq");
    expect(asked?.args).toEqual(["artist_mbid", MBID]);
  });

  it("offers artists to explore while this one has no genres, reading again next time", async () => {
    const own = () => fake.calls.filter((call) => call.method === "eq");
    fake.answer("releases", { data: [] }, { data: [] });
    fake.answer("artists", { data: [person(1)] }, { data: [person(1)] });

    expect((await similarArtists(MBID, 3)).map((a) => a.mbid)).toEqual(["artist-1"]);
    expect(own()).toHaveLength(1);
    await similarArtists(MBID, 3);
    expect(own()).toHaveLength(2);
  });

  it("leaves the artist out of the artists to explore", async () => {
    fake.answer("releases", { data: [] });
    fake.answer("artists", { data: [{ ...person(1), mbid: MBID }, person(2)] });
    expect((await similarArtists(MBID, 3)).map((a) => a.mbid)).toEqual(["artist-2"]);
  });

  it("leaves the artist out of their own suggestions", async () => {
    fake.answer(
      "releases",
      { data: [{ genres: ["rock"] }] },
      {
        data: [
          { artist_mbid: MBID, genres: ["rock"] },
          { artist_mbid: "artist-1", genres: ["rock"] },
        ],
        error: null,
      },
    );
    fake.answer("artists", { data: [person(1)] });
    expect((await similarArtists(MBID, 3)).map((a) => a.mbid)).toEqual(["artist-1"]);
  });

  it("gives back only what's meant to be shown", async () => {
    fake.answer(
      "releases",
      { data: [{ genres: ["rock"] }] },
      { data: [{ artist_mbid: "artist-1", genres: ["rock"] }], error: null },
    );
    fake.answer("artists", { data: [person(1)] });
    expect((await similarArtists(MBID, 3))[0]).toEqual({
      mbid: "artist-1",
      name: "Artist 1",
      image_url: "https://img.test/1",
    });
  });
});
