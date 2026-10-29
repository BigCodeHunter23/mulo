import { describe, expect, it } from "vitest";
import {
  dropMessage,
  followMessage,
  loveMessage,
  split,
  streakMessage,
  versusMessage,
} from "@/lib/push/messages";

const sam = { username: "sam", display_name: "Sam" };

describe("push wording", () => {
  it("names somebody by their display name, or their username", () => {
    expect(followMessage(sam)).toEqual({ title: "Sam followed you", url: "/u/sam" });
    expect(followMessage({ username: "jo_99", display_name: null }).title).toBe(
      "jo_99 followed you",
    );
  });

  it("says review when there is one, rating otherwise", () => {
    const album = { kind: "album" as const, mbid: "m1", title: "Blonde", review: true };
    expect(loveMessage(sam, album)).toEqual({
      title: "Sam loved your review of Blonde",
      url: "/album/m1",
    });
    expect(loveMessage(sam, { ...album, review: false }).title).toBe(
      "Sam loved your rating of Blonde",
    );
    expect(loveMessage(sam, { kind: "artist", mbid: "a1", name: "Frank Ocean" })).toEqual({
      title: "Sam loved your rating of Frank Ocean",
      url: "/artist/a1",
    });
    expect(loveMessage(sam, { kind: "take", day: "2026-10-28", title: "Under Pressure" })).toEqual({
      title: "Sam loved your take on Under Pressure",
      url: "/versus/2026-10-28",
    });
  });

  it("splits a Versus into whole percentages that add to 100", () => {
    expect(split(58, 42)).toEqual([58, 42]);
    expect(split(1, 2)).toEqual([33, 67]);
  });

  it("opens today's Versus, folding in yesterday's result when there is one", () => {
    expect(versusMessage({ title: "Under Pressure" })).toEqual({
      title: "Today's Versus: Under Pressure.",
      body: "Who you got?",
      url: "/versus",
    });
    expect(
      versusMessage(
        { title: "Under Pressure" },
        { title: "King of New York", winner: "Nas", left: 58, right: 42 },
      ),
    ).toEqual({
      title: "Nas took King of New York, 58–42.",
      body: "Today: Under Pressure. Who you got?",
      url: "/versus",
    });
    expect(
      versusMessage(
        { title: "Under Pressure" },
        { title: "King of New York", winner: null, left: 10, right: 10 },
      ).title,
    ).toBe("King of New York finished level, 50–50.");
  });

  it("words the Drop and the streak plainly", () => {
    expect(dropMessage()).toEqual({
      title: "This week's Drop is in.",
      body: "Rate it before you see the scores.",
      url: "/drop",
    });
    expect(streakMessage(12)).toEqual({
      title: "Your 12-day streak ends at midnight.",
      url: "/stack",
    });
  });
});
