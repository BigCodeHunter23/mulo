import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../../test/fake-supabase";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimRead,
  followedAmong,
  followersOf,
  listedDates,
  markRead,
  failRelease,
  keepRelease,
  letGoOfRead,
  pendingReleases,
  queueReleases,
  refuseRelease,
  releasesOn,
  saveConfirmed,
} from "@/lib/releases/store";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const CLIPSE = "0e05ba8a-56a7-4ea6-9d11-8f4f2d10e2d1";
const GROUP = "6ca2762c-ffb5-4ea1-a8c6-2f25993fc99a";
const AT = new Date("2026-10-30T00:10:00Z");

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
});

const call = (table: string, method: string) =>
  fake.callsOn(table).find((c) => c.method === method)?.args;

describe("the day's read", () => {
  it("claims a try, and marks the day read", async () => {
    fake.answer(
      "rpc:claim_release_read",
      { data: true, error: null },
      { data: false, error: null },
    );
    expect(await claimRead("2026-10-30")).toBe(true);
    expect(await claimRead("2026-10-30")).toBe(false);
    expect(call("rpc:claim_release_read", "rpc")).toEqual([
      "claim_release_read",
      { p_day: "2026-10-30" },
    ]);
    await markRead("2026-10-30", AT);
    expect(call("artist_release_reads", "update")).toEqual([
      { read_at: AT.toISOString(), claimed_at: null },
    ]);
  });

  it("lets go of a claim when the read fails, so the next run can try", async () => {
    await letGoOfRead("2026-10-30");
    expect(call("artist_release_reads", "update")).toEqual([{ claimed_at: null }]);
    expect(call("artist_release_reads", "eq")).toEqual(["day", "2026-10-30"]);
    const failure = { code: "57014", message: "timeout" };
    fake.answer("artist_release_reads", { data: null, error: failure });
    await expect(letGoOfRead("2026-10-30")).rejects.toBe(failure);
  });

  it("finds which artists somebody follows, and what's known already, a hundred at a time", async () => {
    fake.answer("rpc:followed_among", {
      data: [{ artist_mbid: TYLER }, { artist_mbid: null }],
      error: null,
    });
    expect(await followedAmong([TYLER, GROUP])).toEqual(new Set([TYLER]));

    fake.answer(
      "new_releases",
      { data: [{ release_group_mbid: GROUP, listed_date: "2026-10-30" }], error: null },
      { data: [], error: null },
    );
    const groups = [GROUP, ...Array.from({ length: 149 }, (_, i) => `g${i}`)];
    expect(await listedDates(groups)).toEqual(new Map([[GROUP, "2026-10-30"]]));
    expect(fake.callsOn("new_releases").filter((c) => c.method === "in")).toHaveLength(2);
  });

  const candidate = {
    group: GROUP,
    artist: TYLER,
    artists: [CLIPSE, TYLER],
    title: "CHROMAKOPIA",
    kind: "album" as const,
    listed: "2026-10-30",
    moved: false,
  };

  it("asks which artists are followed 500 at a time, so no answer reaches PostgREST's 1,000 rows", async () => {
    const artists = Array.from({ length: 1200 }, (_, i) => `a${i}`);
    fake.answer(
      "rpc:followed_among",
      { data: artists.slice(0, 500).map((artist_mbid) => ({ artist_mbid })), error: null },
      { data: [{ artist_mbid: "a700" }], error: null },
      { data: [{ artist_mbid: "a1199" }], error: null },
    );
    const followed = await followedAmong(artists);
    expect(followed.size).toBe(502);
    expect(followed.has("a1199")).toBe(true);
    const sent = fake
      .callsOn("rpc:followed_among")
      .map((c) => (c.args[1] as { p_mbids: string[] }).p_mbids);
    expect(sent.map((ids) => ids.length)).toEqual([500, 500, 200]);
    expect(sent.flat()).toEqual(artists);
  });

  it("throws when asking which artists are followed fails", async () => {
    const failure = { code: "57014", message: "timeout" };
    fake.answer("rpc:followed_among", { data: null, error: failure });
    await expect(followedAmong(["a"])).rejects.toBe(failure);
    expect(await followedAmong([])).toEqual(new Set());
  });

  it("files new releases to confirm, leaving any already there alone", async () => {
    await queueReleases([candidate]);
    expect(call("new_releases", "upsert")).toEqual([
      [
        {
          release_group_mbid: GROUP,
          artist_mbid: TYLER,
          artist_mbids: [CLIPSE, TYLER],
          title: "CHROMAKOPIA",
          kind: "album",
          release_date: "2026-10-30",
          listed_date: "2026-10-30",
        },
      ],
      { onConflict: "release_group_mbid", ignoreDuplicates: true },
    ]);
    expect(call("new_releases", "update")).toBeUndefined();
  });

  it("keeps a confirmed release whose day moved, to be checked again", async () => {
    await queueReleases([{ ...candidate, listed: "2026-11-06", moved: true }]);
    expect(call("new_releases", "upsert")).toBeUndefined();
    const updates = fake.callsOn("new_releases").filter((c) => c.method === "update");
    expect(updates.map((c) => c.args[0])).toEqual([
      // Confirmed: still confirmed, on its day, until MusicBrainz says otherwise.
      { listed_date: "2026-11-06", recheck: true },
      // Waiting or refused: asked about afresh.
      {
        listed_date: "2026-11-06",
        release_date: "2026-11-06",
        artist_mbid: TYLER,
        artist_mbids: [CLIPSE, TYLER],
        title: "CHROMAKOPIA",
        kind: "album",
        refused_at: null,
        tries: 0,
        last_error_at: null,
      },
    ]);
    const filters = fake.callsOn("new_releases").filter((c) => c.method !== "update");
    expect(filters.map((c) => [c.method, ...c.args])).toEqual([
      ["from", "new_releases"],
      ["eq", "release_group_mbid", GROUP],
      ["not", "confirmed_at", "is", null],
      ["from", "new_releases"],
      ["eq", "release_group_mbid", GROUP],
      ["is", "confirmed_at", null],
    ]);
  });

  it("throws a failed write", async () => {
    const failure = { code: "57014", message: "timeout" };
    fake.answer("new_releases", { data: null, error: failure });
    await expect(queueReleases([{ ...candidate, moved: true }])).rejects.toBe(failure);
  });
});

describe("confirming", () => {
  it("hands out the longest waiting first, those that failed last", async () => {
    fake.answer("new_releases", {
      data: [
        {
          release_group_mbid: GROUP,
          artist_mbids: [CLIPSE, TYLER],
          listed_date: "2026-10-30",
          tries: 1,
          recheck: true,
        },
      ],
      error: null,
    });
    expect(await pendingReleases(20)).toEqual([
      { group: GROUP, artists: [CLIPSE, TYLER], listed: "2026-10-30", tries: 1, recheck: true },
    ]);
    expect(call("new_releases", "is")).toEqual(["refused_at", null]);
    expect(call("new_releases", "or")).toEqual(["confirmed_at.is.null,recheck.is.true"]);
    const orders = fake.callsOn("new_releases").filter((c) => c.method === "order");
    expect(orders.map((c) => c.args)).toEqual([
      ["last_error_at", { ascending: true, nullsFirst: true }],
      ["found_at"],
    ]);
    expect(call("new_releases", "limit")).toEqual([20]);
  });

  it("notes a failed try, and refuses the release at the third", async () => {
    await failRelease(GROUP, 2, AT);
    expect(call("new_releases", "update")).toEqual([{ tries: 2, last_error_at: AT.toISOString() }]);
    fake = fakeSupabase();
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    await failRelease(GROUP, 3, AT);
    expect(call("new_releases", "update")).toEqual([
      { tries: 3, last_error_at: AT.toISOString(), refused_at: AT.toISOString() },
    ]);
    fake.answer("new_releases", { data: null, error: { code: "57014", message: "timeout" } });
    await expect(failRelease(GROUP, 1, AT)).rejects.toMatchObject({ code: "57014" });
  });

  it("puts a confirmed release in the catalogue and marks it", async () => {
    await saveConfirmed(
      GROUP,
      {
        title: "CHROMAKOPIA",
        kind: "album",
        date: "2026-10-28",
        primary: { id: TYLER, name: "Tyler, the Creator" },
        artists: [TYLER, CLIPSE],
        credit: "Tyler, the Creator",
      },
      AT,
    );
    expect(call("artists", "upsert")).toEqual([
      { mbid: TYLER, name: "Tyler, the Creator" },
      { onConflict: "mbid", ignoreDuplicates: true },
    ]);
    expect(call("releases", "upsert")).toEqual([
      {
        mbid: GROUP,
        title: "CHROMAKOPIA",
        artist_mbid: TYLER,
        release_date: "2026-10-28",
        cover_art_url: `https://coverartarchive.org/release-group/${GROUP}/front-500`,
        artist_credit: "Tyler, the Creator",
        kind: "album",
      },
      { onConflict: "mbid", ignoreDuplicates: true },
    ]);
    expect(call("releases", "update")).toEqual([{ release_date: "2026-10-28", kind: "album" }]);
    expect(call("new_releases", "update")).toEqual([
      {
        title: "CHROMAKOPIA",
        kind: "album",
        release_date: "2026-10-28",
        artist_mbid: TYLER,
        artist_mbids: [TYLER, CLIPSE],
        confirmed_at: AT.toISOString(),
        refused_at: null,
        recheck: false,
        tries: 0,
        last_error_at: null,
      },
    ]);
  });

  it("keeps a confirmed release as it is when checking it again changes nothing", async () => {
    await keepRelease(GROUP);
    expect(call("new_releases", "update")).toEqual([
      { recheck: false, tries: 0, last_error_at: null },
    ]);
  });

  it("marks one MusicBrainz refused, and throws a failed write", async () => {
    await refuseRelease(GROUP, AT);
    // One confirmed before comes off the shelf and the bell.
    expect(call("new_releases", "update")).toEqual([
      { refused_at: AT.toISOString(), confirmed_at: null, recheck: false },
    ]);
    const failure = { code: "57014", message: "timeout" };
    fake.answer("new_releases", { data: null, error: failure });
    await expect(refuseRelease(GROUP, AT)).rejects.toBe(failure);
  });
});

describe("alerts", () => {
  it("reads the confirmed releases out on some days", async () => {
    fake.answer("new_releases", {
      data: [
        {
          release_group_mbid: GROUP,
          title: "CHROMAKOPIA",
          kind: "album",
          release_date: "2026-10-30",
          artist_mbid: TYLER,
          artist_mbids: [TYLER, CLIPSE],
          artists: { name: "Tyler, the Creator" },
        },
        {
          release_group_mbid: "odd",
          title: "Odd",
          kind: "single",
          release_date: "2026-10-30",
          artist_mbid: TYLER,
          artist_mbids: [TYLER],
          artists: { name: "Tyler, the Creator" },
        },
      ],
      error: null,
    });
    expect(await releasesOn(["2026-10-30"])).toEqual([
      {
        mbid: GROUP,
        title: "CHROMAKOPIA",
        kind: "album",
        day: "2026-10-30",
        artistMbid: TYLER,
        artistMbids: [TYLER, CLIPSE],
        artistName: "Tyler, the Creator",
      },
    ]);
    expect(call("new_releases", "in")).toEqual(["release_date", ["2026-10-30"]]);
    expect(call("new_releases", "not")).toEqual(["confirmed_at", "is", null]);
  });

  it("reads nothing before migration 0026, and nothing for no days", async () => {
    fake.answer("new_releases", { data: null, error: { code: "42P01", message: "missing" } });
    expect(await releasesOn(["2026-10-30"])).toEqual([]);
    expect(await releasesOn([])).toEqual([]);
  });

  it("finds each artist's followers", async () => {
    fake.answer("artist_follows", {
      data: [
        { user_id: "a", artist_mbid: TYLER },
        { user_id: "b", artist_mbid: TYLER },
      ],
      error: null,
    });
    expect(await followersOf([TYLER])).toEqual(new Map([[TYLER, new Set(["a", "b"])]]));
  });
});
