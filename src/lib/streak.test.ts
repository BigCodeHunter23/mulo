import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/push/store", () => ({ readTimeZone: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/read-all", () => ({ readAll: vi.fn() }));

import { readTimeZone } from "@/lib/push/store";
import { readAll } from "@/lib/supabase/read-all";
import { countStreak, getStreak } from "@/lib/streak";

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

describe("getStreak's time zone", () => {
  // 05:00 UTC on 29 Oct is 16:00 that day in Sydney but 22:00 on the 28th in Los Angeles.
  const stamp = "2026-10-29T05:00:00Z";
  const sydney = { days: 1, today: true, best: 1 };
  const losAngeles = { days: 1, today: false, best: 1 };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    vi.mocked(readTimeZone).mockReset();
    vi.mocked(readAll).mockReset();
    // Only the first table has anything; the rest are empty.
    vi.mocked(readAll).mockResolvedValueOnce({ data: [{ created_at: stamp }], error: null });
    vi.mocked(readAll).mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the person's zone when none is passed", async () => {
    vi.mocked(readTimeZone).mockResolvedValue("America/Los_Angeles");
    expect(await getStreak("u")).toEqual(losAngeles);
    expect(readTimeZone).toHaveBeenCalledWith("u");
  });

  it("uses Sydney, without looking, when the zone is passed as null", async () => {
    expect(await getStreak("u", null)).toEqual(sydney);
    expect(readTimeZone).not.toHaveBeenCalled();
  });

  it("still answers, in Sydney's time, when the zone can't be read", async () => {
    vi.mocked(readTimeZone).mockResolvedValue(null);
    expect(await getStreak("u")).toEqual(sydney);
  });
});
