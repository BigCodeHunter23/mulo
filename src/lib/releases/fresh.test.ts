import { describe, expect, it, vi } from "vitest";
import {
  DAYS_AHEAD,
  DAYS_BACK,
  newCandidates,
  readFreshReleases,
  toFresh,
  type FreshRelease,
} from "@/lib/releases/fresh";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const CLIPSE = "0e05ba8a-56a7-4ea6-9d11-8f4f2d10e2d1";
const GROUP = "6ca2762c-ffb5-4ea1-a8c6-2f25993fc99a";
const OTHER_GROUP = "8ddd27bd-16c5-4205-9eff-f55a2951802a";

/** One release as ListenBrainz lists it. */
const listed = (over: Record<string, unknown> = {}) => ({
  artist_credit_name: "Tyler, the Creator",
  artist_mbids: [TYLER],
  caa_id: null,
  caa_release_mbid: null,
  listen_count: 0,
  release_date: "2026-10-30",
  release_group_mbid: GROUP,
  release_group_primary_type: "Album",
  release_mbid: "802ade79-d6c9-43a6-b64d-0f956a4d6fb2",
  release_name: "CHROMAKOPIA",
  release_tags: [],
  ...over,
});

describe("toFresh", () => {
  it("keeps albums and EPs", () => {
    expect(toFresh(listed())).toEqual({
      group: GROUP,
      artists: [TYLER],
      date: "2026-10-30",
      kind: "album",
      title: "CHROMAKOPIA",
    });
    expect(toFresh(listed({ release_group_primary_type: "EP" }))?.kind).toBe("ep");
  });

  it("drops singles, other types, secondary types and anything malformed", () => {
    expect(toFresh(listed({ release_group_primary_type: "Single" }))).toBeNull();
    expect(toFresh(listed({ release_group_primary_type: null }))).toBeNull();
    expect(toFresh(listed({ release_group_secondary_type: "Live" }))).toBeNull();
    expect(toFresh(listed({ release_group_mbid: "nope" }))).toBeNull();
    expect(toFresh(listed({ release_date: "2026-10" }))).toBeNull();
    expect(toFresh(listed({ artist_mbids: ["nope"] }))).toBeNull();
    expect(toFresh("nonsense")).toBeNull();
  });

  it("drops a day that doesn't exist, and cuts a long title to 500 characters", () => {
    expect(toFresh(listed({ release_date: "2026-02-30" }))).toBeNull();
    expect(toFresh(listed({ release_name: "y".repeat(800) }))?.title).toHaveLength(500);
    expect(toFresh(listed({ release_name: "IGOR\u0000" }))?.title).toBe("IGOR");
  });
});

describe("readFreshReleases", () => {
  const answering = (back: unknown[], ahead: unknown[], status = 200) =>
    vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify({
            payload: { releases: input.includes("past=true") ? back : ahead, total_count: 0 },
          }),
          { status },
        ),
    );

  it("reads the week behind and the month ahead, each album once at its earliest date", async () => {
    const fetcher = answering(
      [listed({ release_date: "2026-10-28" })],
      [
        listed(),
        listed({
          release_group_mbid: OTHER_GROUP,
          release_group_primary_type: "EP",
          release_date: "2026-11-06",
          release_name: "Let God Sort Em Out",
        }),
      ],
    );
    expect(await readFreshReleases("2026-10-30", fetcher)).toEqual([
      expect.objectContaining({ group: GROUP, date: "2026-10-28" }),
      expect.objectContaining({ group: OTHER_GROUP, kind: "ep" }),
    ]);
    const asked = fetcher.mock.calls.map(([url]) => url);
    const api = "https://api.listenbrainz.org/1/explore/fresh-releases/";
    expect(asked).toContain(
      `${api}?release_date=2026-10-30&days=${DAYS_BACK}&past=true&future=false`,
    );
    expect(asked).toContain(
      `${api}?release_date=2026-10-30&days=${DAYS_AHEAD}&past=false&future=true`,
    );
  });

  it("skips the listings it can't use and keeps the rest", async () => {
    const fetcher = answering(
      [
        listed({ release_date: "2026-02-30", release_group_mbid: OTHER_GROUP }),
        { nonsense: true },
        listed({ release_date: "2026-10-28" }),
      ],
      [],
    );
    expect(await readFreshReleases("2026-10-30", fetcher)).toEqual([
      expect.objectContaining({ group: GROUP, date: "2026-10-28" }),
    ]);
  });

  it("fails when ListenBrainz does, or answers in a shape it doesn't know", async () => {
    await expect(readFreshReleases("2026-10-30", answering([], [], 503))).rejects.toThrow(/503/);
    const odd = vi.fn(async () => new Response(JSON.stringify({ releases: [] })));
    await expect(readFreshReleases("2026-10-30", odd)).rejects.toThrow(/shape/);
  });
});

describe("newCandidates", () => {
  const fresh = (over: Partial<FreshRelease> = {}): FreshRelease => ({
    group: GROUP,
    artists: [CLIPSE, TYLER],
    date: "2026-10-30",
    kind: "album",
    title: "CHROMAKOPIA",
    ...over,
  });

  it("keeps releases by a followed artist, with every credited artist, followed or not", () => {
    expect(newCandidates([fresh()], new Set([TYLER]), new Map(), "2026-10-30")).toEqual([
      {
        group: GROUP,
        artist: TYLER,
        artists: [CLIPSE, TYLER],
        title: "CHROMAKOPIA",
        kind: "album",
        listed: "2026-10-30",
      },
    ]);
    expect(newCandidates([fresh()], new Set(), new Map(), "2026-10-30")).toEqual([]);
  });

  it("skips one known on the same day, and asks again when its day moved", () => {
    const followed = new Set([TYLER]);
    expect(
      newCandidates([fresh()], followed, new Map([[GROUP, "2026-10-30"]]), "2026-10-30"),
    ).toEqual([]);
    expect(
      newCandidates([fresh()], followed, new Map([[GROUP, "2026-11-06"]]), "2026-10-30"),
    ).toHaveLength(1);
  });

  it("keeps to the week behind and the month ahead", () => {
    const days = ["2026-10-22", "2026-10-23", "2026-11-29", "2026-11-30"].map((date, i) =>
      fresh({ group: `${i}`, date }),
    );
    expect(
      newCandidates(days, new Set([TYLER]), new Map(), "2026-10-30").map((c) => c.listed),
    ).toEqual(["2026-10-23", "2026-11-29"]);
  });
});
