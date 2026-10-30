import { describe, expect, it } from "vitest";
import { releaseAlerts } from "@/lib/releases/alerts";
import type { DayRelease } from "@/lib/releases/store";

const release = (over: Partial<DayRelease> = {}): DayRelease => ({
  mbid: "m1",
  title: "CHROMAKOPIA",
  kind: "album",
  day: "2026-10-30",
  artistMbid: "tyler",
  artistMbids: ["tyler"],
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
        release({
          mbid: "m2",
          artistMbid: "clipse",
          artistMbids: ["clipse"],
          artistName: "Clipse",
        }),
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

  it("tells the followers of every credited artist, naming the first credited", () => {
    // Credited to Tyler and Clipse: x follows Tyler, y follows Clipse, and z
    // followed Clipse only after the release was found.
    const together = release({ artistMbids: ["tyler", "clipse"] });
    const messages = releaseAlerts(
      ["x", "y", "z", "w"].map((userId) => ({ userId, day: "2026-10-30" })),
      [together],
      new Map([
        ["tyler", new Set(["x"])],
        ["clipse", new Set(["y", "z"])],
      ]),
    );
    expect(messages.map((m) => m.userId)).toEqual(["x", "y", "z"]);
    expect(new Set(messages.map((m) => m.title))).toEqual(
      new Set(["Tyler, the Creator's new album is out today"]),
    );
  });

  it("counts a release once for somebody following two of its artists", () => {
    const messages = releaseAlerts(
      [{ userId: "x", day: "2026-10-30" }],
      [release({ artistMbids: ["tyler", "clipse"] })],
      new Map([
        ["tyler", new Set(["x"])],
        ["clipse", new Set(["x"])],
      ]),
    );
    expect(messages).toEqual([
      expect.objectContaining({ title: "Tyler, the Creator's new album is out today" }),
    ]);
  });
});
