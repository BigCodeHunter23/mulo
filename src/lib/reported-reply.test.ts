import { describe, expect, it } from "vitest";
import { reportDetail, REPLY_KEPT, replyWordsIn } from "@/lib/reported-reply";

describe("a reply's words in its report", () => {
  it("puts the reporter's own words first, then the reply's", () => {
    expect(reportDetail("Third time today.", "Buy followers")).toBe(
      "Third time today.\n\nReply: Buy followers",
    );
    expect(reportDetail("", "Buy followers")).toBe("Reply: Buy followers");
  });

  it("keeps the reply's first 1,000 characters, never half an emoji", () => {
    const body = "x".repeat(REPLY_KEPT - 1) + "\u{1F600}" + "more";
    expect(reportDetail("", body)).toBe(`Reply: ${"x".repeat(REPLY_KEPT - 1)}\u{1F600}`);
  });

  it("reads them back apart", () => {
    expect(replyWordsIn("Third time today.\n\nReply: Buy followers")).toEqual({
      said: "Third time today.",
      words: "Buy followers",
    });
    expect(replyWordsIn("Reply: Buy followers")).toEqual({ said: null, words: "Buy followers" });
  });

  it("finds no reply's words in a report without them", () => {
    expect(replyWordsIn(null)).toBeNull();
    expect(replyWordsIn("Sent when they blocked this person.")).toBeNull();
    expect(replyWordsIn("Replying to nobody")).toBeNull();
  });
});
