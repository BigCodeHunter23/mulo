import { describe, expect, it } from "vitest";
import { releaseAlerts } from "@/lib/releases/alerts";
import type { DayRelease } from "@/lib/releases/store";

const release = (over: Partial<DayRelease> = {}): DayRelease => ({
  mbid: "m1",
  title: "CHROMAKOPIA",
  kind: "album",
  day: "2026-10-30",
  artistMbid: "tyler",
  artistName: "Tyler, the Creator",
  ...over,
});

describe("releaseAlerts", () => {
  it("tells a follower on the day, keyed by their day", () => {
    expect(
      releaseAlerts(
        [{ userId: "a", day: "2026-10-30" }],
        [release()],
        new Map([["tyler", new Set(["a"])]]),
      ),
    ).toEqual([
      {
        userId: "a",
        kind: "release",
        key: "2026-10-30",
        title: "Tyler, the Creator's new album is out today",
        body: "CHROMAKOPIA",
        url: "/album/m1",
      },
    ]);
  });

  it("sends one push however many releases there are", () => {
    const messages = releaseAlerts(
      [{ userId: "a", day: "2026-10-30" }],
      [
        release(),
        release({ mbid: "m2", artistMbid: "clipse", artistName: "Clipse" }),
        release({ mbid: "m3", kind: "ep" }),
      ],
      new Map([
        ["tyler", new Set(["a"])],
        ["clipse", new Set(["a"])],
      ]),
    );
    expect(messages).toEqual([
      expect.objectContaining({ title: "3 new releases from artists you follow", url: "/" }),
    ]);
  });

  it("leaves out people who don't follow the artist, and releases on another day", () => {
    expect(
      releaseAlerts(
        [
          { userId: "a", day: "2026-10-31" },
          { userId: "b", day: "2026-10-30" },
        ],
        [release()],
        new Map([["tyler", new Set(["a"])]]),
      ),
    ).toEqual([]);
  });
});
