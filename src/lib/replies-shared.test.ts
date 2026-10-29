import { describe, expect, it } from "vitest";
import {
  COUNT_FROM,
  MENTIONS_MAX,
  parseMentions,
  prefillFor,
  REPLY_LIMIT,
  replyCountText,
  splitMentions,
  THREAD_GONE,
  threadHref,
  withoutFormatting,
} from "@/lib/replies-shared";

describe("parseMentions", () => {
  it("finds names in any case, once each, lower-cased", () => {
    expect(parseMentions("@Sam and @joe, then @SAM again")).toEqual(["sam", "joe"]);
  });

  it("needs a username's shape, and nothing straight before the @", () => {
    expect(parseMentions("mail jo@example.com or @ab or @abc")).toEqual(["abc"]);
    expect(parseMentions(`@${"a".repeat(21)}`)).toEqual([]);
    expect(parseMentions("2@sam x_@sam")).toEqual([]);
  });

  it("reads names up to punctuation, and across lines", () => {
    expect(parseMentions("(@sam), @joe's\n@kim.")).toEqual(["sam", "joe", "kim"]);
  });

  it("keeps the first five different names", () => {
    expect(parseMentions("@aaa @bbb @aaa @ccc @ddd @eee @fff")).toEqual([
      "aaa",
      "bbb",
      "ccc",
      "ddd",
      "eee",
    ]);
    expect(MENTIONS_MAX).toBe(5);
  });
});

describe("splitMentions", () => {
  it("links real people's names by their own username, keeping every character", () => {
    const text = "Nah @SAM, listen to @jo_2 and @nobody.";
    const parts = splitMentions(text, ["sam", "Jo_2"]);
    expect(parts).toEqual([
      { text: "Nah ", mention: null },
      { text: "@SAM", mention: "sam" },
      { text: ", listen to ", mention: null },
      { text: "@jo_2", mention: "Jo_2" },
      { text: " and @nobody.", mention: null },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it("leaves words without names whole", () => {
    expect(splitMentions("jo@example.com", ["example"])).toEqual([
      { text: "jo@example.com", mention: null },
    ]);
  });
});

describe("the rest", () => {
  it("gives each thread one address", () => {
    expect(threadHref({ kind: "album", mbid: "m", id: 7 })).toBe("/album/m/reviews/7");
    expect(threadHref({ kind: "artist", mbid: "a", id: 8 })).toBe("/artist/a/reviews/8");
    expect(threadHref({ kind: "take", day: "2026-10-29", id: 9 })).toBe(
      "/versus/2026-10-29/takes/9",
    );
  });

  it("words a count, inviting the first reply", () => {
    expect(replyCountText(0)).toBe("Reply");
    expect(replyCountText(1)).toBe("1 reply");
    expect(replyCountText(4)).toBe("4 replies");
  });

  it("starts a reply to somebody with their name, once", () => {
    expect(prefillFor("", "sam")).toBe("@sam ");
    expect(prefillFor("  ", "sam")).toBe("@sam ");
    expect(prefillFor("good point", "sam")).toBe("@sam good point");
    expect(prefillFor("@Sam good point", "sam")).toBe("@Sam good point");
  });

  it("holds the limits and words the app shares", () => {
    expect(REPLY_LIMIT).toBe(1000);
    expect(COUNT_FROM).toBe(900);
    expect(THREAD_GONE).toBe("This review has gone.");
  });
});

describe("withoutFormatting", () => {
  it("drops direction overrides, isolates and invisible characters", () => {
    expect(withoutFormatting("\u202Eevil\u202C \u2066x\u2069")).toBe("evil x");
    expect(withoutFormatting("a\u200Bb\uFEFFc\u00ADd\u2060e")).toBe("abcde");
  });

  it("keeps the joiners that emoji and some scripts need, and every line break", () => {
    const family = "\u{1F469}\u200D\u{1F467}";
    expect(withoutFormatting(family)).toBe(family);
    expect(withoutFormatting("\u0645\u200C\u06CC")).toBe("\u0645\u200C\u06CC");
    expect(withoutFormatting("one\ntwo\r\n\tthree")).toBe("one\ntwo\r\n\tthree");
  });

  it("leaves nothing of a reply made only of them", () => {
    expect(withoutFormatting("\u202E\u200B\u2066").trim()).toBe("");
  });
});
