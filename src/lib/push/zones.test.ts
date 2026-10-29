import { describe, expect, it } from "vitest";
import { isTimeZone, localClock, SYDNEY, zoneOrSydney } from "@/lib/push/zones";

describe("time zones", () => {
  it("knows a real zone from a made-up one", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(isTimeZone("x".repeat(65))).toBe(false);
  });

  it("falls back to Sydney's", () => {
    expect(zoneOrSydney(null)).toBe(SYDNEY);
    expect(zoneOrSydney("Nowhere/Land")).toBe(SYDNEY);
    expect(zoneOrSydney("America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("reads the local day and minutes past midnight", () => {
    // 22:30 UTC on 28 Oct 2026 is 09:30 on the 29th in Sydney (daylight time, +11).
    const at = new Date("2026-10-28T22:30:00Z");
    expect(localClock(at, SYDNEY)).toEqual({ day: "2026-10-29", minutes: 9 * 60 + 30 });
    expect(localClock(at, "Europe/London")).toEqual({ day: "2026-10-28", minutes: 22 * 60 + 30 });
  });

  it("calls midnight 0, never 24", () => {
    expect(localClock(new Date("2026-10-29T00:00:00Z"), "UTC")).toEqual({
      day: "2026-10-29",
      minutes: 0,
    });
  });
});
