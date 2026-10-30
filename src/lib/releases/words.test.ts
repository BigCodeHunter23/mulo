import { describe, expect, it } from "vitest";
import { KIND_LABEL, KIND_WORD, releaseWhen, shortDate, toKind } from "@/lib/releases/words";

describe("a release in words", () => {
  it("knows albums and EPs, and nothing else", () => {
    expect(toKind("album")).toBe("album");
    expect(toKind("ep")).toBe("ep");
    expect(toKind("single")).toBeNull();
    expect(toKind(null)).toBeNull();
    expect([KIND_WORD.album, KIND_WORD.ep, KIND_LABEL.album, KIND_LABEL.ep]).toEqual([
      "album",
      "EP",
      "Album",
      "EP",
    ]);
  });

  it("writes a day short", () => {
    expect(shortDate("2026-10-12")).toBe("12 Oct");
    expect(shortDate("2027-01-05")).toBe("5 Jan");
  });

  // Friday 30 October 2026.
  const today = "2026-10-30";

  it("says Today, a weekday within the week, and a date before that", () => {
    expect(releaseWhen("2026-10-30", today)).toBe("Today");
    expect(releaseWhen("2026-10-29", today)).toBe("Thursday");
    expect(releaseWhen("2026-10-24", today)).toBe("Saturday");
    expect(releaseWhen("2026-10-23", today)).toBe("23 Oct");
  });

  it("dates one coming soon", () => {
    expect(releaseWhen("2026-10-31", today)).toBe("31 Oct");
    expect(releaseWhen("2026-11-06", today)).toBe("6 Nov");
  });
});
