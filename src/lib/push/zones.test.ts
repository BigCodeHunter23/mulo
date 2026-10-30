import { describe, expect, it } from "vitest";
import {
  addDays,
  canonicalZone,
  isTimeZone,
  localClock,
  momentAt,
  SYDNEY,
  zoneOrSydney,
} from "@/lib/push/zones";

describe("time zones", () => {
  it("knows a real zone from a made-up one", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(isTimeZone("x".repeat(65))).toBe(false);
  });

  it("spells a zone the runtime's way", () => {
    expect(canonicalZone("europe/london")).toBe("Europe/London");
    expect(canonicalZone("AMERICA/NEW_YORK")).toBe("America/New_York");
    expect(canonicalZone("Europe/London")).toBe("Europe/London");
    expect(canonicalZone("Nowhere/Land")).toBeNull();
    expect(canonicalZone("")).toBeNull();
    expect(canonicalZone(null)).toBeNull();
    expect(canonicalZone("x".repeat(65))).toBeNull();
  });

  it("reads the same clock however the zone is spelled", () => {
    const at = new Date("2026-10-28T22:30:00Z");
    expect(localClock(at, "europe/london")).toEqual(localClock(at, "Europe/London"));
    expect(zoneOrSydney("europe/london")).toBe("Europe/London");
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

describe("addDays and momentAt", () => {
  it("moves a day either way, across months and years", () => {
    expect(addDays("2026-10-30", 2)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-10-30", 0)).toBe("2026-10-30");
  });

  it("finds 10am on a day in each zone", () => {
    expect(momentAt("2026-10-30", 600, "Australia/Sydney").toISOString()).toBe(
      "2026-10-29T23:00:00.000Z",
    );
    expect(momentAt("2026-10-30", 600, "America/Los_Angeles").toISOString()).toBe(
      "2026-10-30T17:00:00.000Z",
    );
    expect(momentAt("2026-10-30", 600, "Europe/London").toISOString()).toBe(
      "2026-10-30T10:00:00.000Z",
    );
    expect(momentAt("2026-10-30", 600, "Asia/Kolkata").toISOString()).toBe(
      "2026-10-30T04:30:00.000Z",
    );
  });

  it("gets the day the clocks change right", () => {
    // London goes back an hour at 2am on 25 Oct 2026, before 10am.
    expect(momentAt("2026-10-25", 600, "Europe/London").toISOString()).toBe(
      "2026-10-25T10:00:00.000Z",
    );
  });
});
