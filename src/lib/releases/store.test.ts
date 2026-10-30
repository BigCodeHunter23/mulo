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
    expect(call("artist_release_reads", "update")).toEqual([{ read_at: AT.toISOString() }]);
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

  it("files releases to confirm, asking again about one whose day moved", async () => {
    await queueReleases([
      {
        group: GROUP,
        artist: TYLER,
        artists: [CLIPSE, TYLER],
        title: "CHROMAKOPIA",
        kind: "album",
        listed: "2026-10-30",
      },
    ]);
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
          confirmed_at: null,
          refused_at: null,
        },
      ],
      { onConflict: "release_group_mbid" },
    ]);
  });
});

describe("confirming", () => {
  it("hands out the longest waiting first", async () => {
    fake.answer("new_releases", {
      data: [
        { release_group_mbid: GROUP, artist_mbids: [CLIPSE, TYLER], listed_date: "2026-10-30" },
      ],
      error: null,
    });
    expect(await pendingReleases(20)).toEqual([
      { group: GROUP, artists: [CLIPSE, TYLER], listed: "2026-10-30" },
    ]);
    expect(call("new_releases", "order")).toEqual(["found_at"]);
    expect(call("new_releases", "limit")).toEqual([20]);
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
      },
    ]);
  });

  it("marks one MusicBrainz refused, and throws a failed write", async () => {
    await refuseRelease(GROUP, AT);
    expect(call("new_releases", "update")).toEqual([{ refused_at: AT.toISOString() }]);
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
