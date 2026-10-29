import { describe, expect, it } from "vitest";
import {
  clean,
  dropMessage,
  followMessage,
  loveMessage,
  nameOf,
  split,
  streakMessage,
  versusMessage,
  firstLine,
  mentionMessage,
  replyMessage,
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

  it("keeps control and format characters out of a push", () => {
    // A right-to-left override would make the rest of the push read backwards.
    expect(clean("Sam\u202Egnp.exe", 40)).toBe("Samgnp.exe");
    expect(clean("Sam\nfollowed you\r\n\tand more", 40)).toBe("Sam followed you and more");
    expect(clean("  a \u200B b\u0000  ", 40)).toBe("a b");
    expect(clean("\u2066\u2069", 40)).toBe("");
  });

  it("keeps the joiners that hold emoji families and some names together", () => {
    const family = "\u{1F469}\u200d\u{1F467}";
    expect(clean(`Sam ${family}`, 40)).toBe(`Sam ${family}`);
    expect(clean("\u0645\u06cc\u200c\u062e\u0648\u0627\u0645", 40)).toBe(
      "\u0645\u06cc\u200c\u062e\u0648\u0627\u0645",
    );
  });

  it("cuts a long name or title with an ellipsis", () => {
    expect(clean("a".repeat(40), 40)).toBe("a".repeat(40));
    expect(clean("a".repeat(41), 40)).toBe(`${"a".repeat(39)}…`);
    // Counted in characters, so an emoji is never split in half.
    expect(clean("😀".repeat(5), 3)).toBe("😀😀…");
  });

  it("cleans names and titles in every push that shows them", () => {
    const sly = { username: "sam", display_name: "Sam\u202E\nX".padEnd(60, "y") };
    const follow = followMessage(sly).title;
    expect(follow).not.toMatch(/[\u202E\n]/);
    expect(follow).toBe(`${"Sam X".padEnd(39, "y")}… followed you`);
    expect(nameOf({ username: "jo_99", display_name: "\u200B\u202E" })).toBe("jo_99");
    const album = {
      kind: "album" as const,
      mbid: "m",
      title: "Blonde\n".repeat(30),
      review: false,
    };
    const love = loveMessage(sam, album).title;
    expect(love).toMatch(/^Sam loved your rating of Blonde Blonde .*…$/);
    expect(love.length).toBe("Sam loved your rating of ".length + 80);
    expect(
      versusMessage({ title: "A\u202Eb" }, { title: "C\nd", winner: "E\tf", left: 2, right: 1 }),
    ).toEqual({ title: "E f took C d, 67–33.", body: "Today: Ab. Who you got?", url: "/versus" });
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

describe("reply pushes", () => {
  const joe = { username: "joe", display_name: "Jo" };
  const blonde = { kind: "album" as const, mbid: "m1", id: 7, title: "Blonde" };
  const pressure = { kind: "take" as const, day: "2026-10-29", id: 9, title: "Under Pressure" };

  it("tells the author, with the reply's first line, opening the thread", () => {
    expect(replyMessage(joe, blonde, "\n  So good.\nSecond line")).toEqual({
      title: "Jo replied to your review of Blonde",
      body: "So good.",
      url: "/album/m1/reviews/7",
    });
    expect(replyMessage(joe, pressure, "Nah.")).toEqual({
      title: "Jo replied to your take on Under Pressure",
      body: "Nah.",
      url: "/versus/2026-10-29/takes/9",
    });
    expect(
      replyMessage(joe, { kind: "artist", mbid: "a1", id: 8, name: "Frank Ocean" }, "Yes."),
    ).toEqual({
      title: "Jo replied to your review of Frank Ocean",
      body: "Yes.",
      url: "/artist/a1/reviews/8",
    });
  });

  it("tells somebody named whose thread it is", () => {
    expect(mentionMessage(joe, sam, blonde, "@kim hear this")).toEqual({
      title: "Jo mentioned you on Sam's review of Blonde",
      body: "@kim hear this",
      url: "/album/m1/reviews/7",
    });
    expect(mentionMessage(joe, sam, pressure, "@kim").title).toBe(
      "Jo mentioned you on Sam's take on Under Pressure",
    );
  });

  it("cleans the first line and cuts it at 100 characters", () => {
    const long = firstLine("a".repeat(150));
    expect(Array.from(long)).toHaveLength(100);
    expect(long.endsWith("…")).toBe(true);
    expect(firstLine("a\u202Eb")).toBe("ab");
    expect(firstLine("\n \n")).toBe("");
  });
});
