import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push/store", () => ({ readTimeZone: vi.fn(async () => "Australia/Sydney") }));
vi.mock("@/lib/releases/shelf", () => ({ readFollowedReleases: vi.fn() }));

import { readFollowedReleases, type FollowedRow } from "@/lib/releases/shelf";
import {
  latestReleaseAt,
  releaseNotifications,
  toReleaseLines,
} from "@/lib/releases/notifications";

const SYDNEY = "Australia/Sydney";
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
const line = {
  kind: "release",
  key: "release-m1",
  // 10am on 30 Oct in Sydney.
  at: "2026-10-29T23:00:00.000Z",
  release: {
    mbid: "m1",
    title: "CHROMAKOPIA",
    kind: "album",
    cover_art_url: "https://coverartarchive.org/release-group/m1/front-500",
    artist: tyler,
  },
};

beforeEach(() => vi.mocked(readFollowedReleases).mockResolvedValue([row()]));

describe("toReleaseLines", () => {
  it("shows a release from 10am on its day, where they are", () => {
    // 09:30 and 10:30 on 30 Oct in Sydney.
    expect(toReleaseLines([row()], SYDNEY, new Date("2026-10-29T22:30:00Z"))).toEqual([]);
    expect(toReleaseLines([row()], SYDNEY, new Date("2026-10-29T23:30:00Z"))).toEqual([line]);
  });

  it("counts from the day they followed", () => {
    const at = new Date("2026-10-31T00:00:00Z");
    // Followed at 4pm on the 30th, Sydney time: that day's release still counts.
    const followedThatDay = "2026-10-30T05:00:00Z";
    expect(toReleaseLines([row({ followedAt: followedThatDay })], SYDNEY, at)).toHaveLength(1);
    expect(
      toReleaseLines([row({ day: "2026-10-29", followedAt: followedThatDay })], SYDNEY, at),
    ).toEqual([]);
  });

  it("still lists one found days late, dated by its day", () => {
    expect(toReleaseLines([row()], SYDNEY, new Date("2026-11-02T03:00:00Z"))).toEqual([line]);
  });
});

describe("releaseNotifications", () => {
  it("reads the last 30 days on their own clock", async () => {
    const at = new Date("2026-10-29T23:30:00Z");
    expect(await releaseNotifications("me", at)).toEqual([line]);
    expect(readFollowedReleases).toHaveBeenCalledWith("me", "2026-09-30", "2026-10-30");
    expect(await latestReleaseAt("me", at)).toBe("2026-10-29T23:00:00.000Z");
  });
});
