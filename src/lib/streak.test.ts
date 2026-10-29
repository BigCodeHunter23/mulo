import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/push/store", () => ({ readTimeZone: vi.fn(async () => null) }));

import { countStreak } from "@/lib/streak";

describe("countStreak", () => {
  // 10:00 UTC on 29 Oct is 21:00 in Sydney and 03:00 in Los Angeles.
  const now = new Date("2026-10-29T10:00:00Z");

  it("counts days in a row up to today", () => {
    const stamps = ["2026-10-27T01:00:00Z", "2026-10-28T01:00:00Z", "2026-10-29T01:00:00Z"];
    expect(countStreak(stamps, "UTC", now)).toEqual({ days: 3, today: true, best: 3 });
  });

  it("keeps a streak alive until the day is over", () => {
    const stamps = ["2026-10-27T12:00:00Z", "2026-10-28T12:00:00Z"];
    expect(countStreak(stamps, "UTC", now)).toEqual({ days: 2, today: false, best: 2 });
  });

  it("counts in the person's own zone", () => {
    // 23:30 UTC on the 27th is the 28th in Sydney but still the 27th in Los Angeles.
    const stamps = ["2026-10-27T23:30:00Z", "2026-10-28T23:30:00Z"];
    expect(countStreak(stamps, "Australia/Sydney", now).days).toBe(2);
    expect(countStreak(stamps, "America/Los_Angeles", now)).toEqual({
      days: 2,
      today: false,
      best: 2,
    });
  });

  it("finds the best run even when today's is broken", () => {
    const stamps = ["2026-10-01T12:00:00Z", "2026-10-02T12:00:00Z", "2026-10-03T12:00:00Z"];
    expect(countStreak(stamps, "UTC", now)).toEqual({ days: 0, today: false, best: 3 });
  });
});
