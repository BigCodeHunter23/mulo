import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../../test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/push/store", () => ({ readTimeZone: vi.fn(async () => "Europe/London") }));

import { createClient } from "@/lib/supabase/server";
import { getNewReleases, toShelf, type FollowedRow } from "@/lib/releases/shelf";

const tyler = { mbid: "tyler", name: "Tyler, the Creator" };
const row = (over: Partial<FollowedRow> = {}): FollowedRow => ({
  mbid: "m1",
  title: "CHROMAKOPIA",
  kind: "album",
  day: "2026-10-30",
  artist: tyler,
  followedAt: "2026-10-01T00:00:00Z",
  ...over,
});

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
});

describe("toShelf", () => {
  it("puts what's out first, newest first, then what's coming, soonest first", () => {
    const shelf = toShelf(
      [
        row({ mbid: "soon2", day: "2026-11-20" }),
        row({ mbid: "old", day: "2026-10-12" }),
        row({ mbid: "soon1", day: "2026-11-06" }),
        row({ mbid: "today" }),
        row({ mbid: "week", day: "2026-10-28" }),
      ],
      "2026-10-30",
    );
    expect(shelf.map((r) => [r.mbid, r.when, r.soon])).toEqual([
      ["today", "Today", false],
      ["week", "Wednesday", false],
      ["old", "12 Oct", false],
      ["soon1", "6 Nov", true],
      ["soon2", "20 Nov", true],
    ]);
    expect(shelf[0]).toEqual({
      mbid: "today",
      title: "CHROMAKOPIA",
      kind: "album",
      release_date: "2026-10-30",
      cover_art_url: "https://coverartarchive.org/release-group/today/front-500",
      artist: tyler,
      when: "Today",
      soon: false,
    });
  });
});

describe("getNewReleases", () => {
  it("reads four weeks back and a month ahead from the viewer's own today", async () => {
    fake.answer("rpc:followed_releases", {
      data: [
        {
          release_group_mbid: "m1",
          title: "CHROMAKOPIA",
          kind: "album",
          release_date: "2026-10-30",
          artist_mbid: "tyler",
          artist_name: "Tyler, the Creator",
          followed_at: "2026-10-01T00:00:00Z",
        },
        {
          release_group_mbid: null,
          title: null,
          kind: null,
          release_date: null,
          artist_mbid: null,
          artist_name: null,
          followed_at: null,
        },
      ],
      error: null,
    });
    // 00:30 on 31 Oct in London: CHROMAKOPIA came out yesterday, a Friday.
    const shelf = await getNewReleases("me", new Date("2026-10-31T00:30:00Z"));
    expect(shelf.map((r) => [r.mbid, r.when])).toEqual([["m1", "Friday"]]);
    expect(fake.callsOn("rpc:followed_releases")[0]?.args).toEqual([
      "followed_releases",
      { p_user: "me", p_from: "2026-10-04", p_to: "2026-11-30" },
    ]);
  });

  it("shows nothing when the database can't say", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    fake.answer("rpc:followed_releases", { data: null, error: { code: "PGRST202", message: "x" } });
    expect(await getNewReleases("me")).toEqual([]);
  });
});
