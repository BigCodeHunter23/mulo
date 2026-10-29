import { describe, expect, it } from "vitest";
import { ALL_ON, dayKey, hourKey, inSlot, isAway, SLOTS, streakDue, wants } from "@/lib/push/who";

describe("who gets what", () => {
  it("finds the hour after each slot, in the person's zone", () => {
    // 22:10 UTC on 28 Oct is 09:10 on the 29th in Sydney.
    const at = new Date("2026-10-28T22:10:00Z");
    expect(inSlot(at, "Australia/Sydney", SLOTS.versus)).toBe(true);
    expect(inSlot(at, "Europe/London", SLOTS.versus)).toBe(false);
    // 59 minutes in is still in; an hour in is out.
    expect(inSlot(new Date("2026-10-28T22:59:00Z"), "Australia/Sydney", SLOTS.versus)).toBe(true);
    expect(inSlot(new Date("2026-10-28T23:00:00Z"), "Australia/Sydney", SLOTS.versus)).toBe(false);
  });

  it("follows daylight saving: 9am in London is 09:00 UTC in winter and 08:00 UTC in summer", () => {
    expect(inSlot(new Date("2026-12-01T09:05:00Z"), "Europe/London", SLOTS.versus)).toBe(true);
    expect(inSlot(new Date("2026-07-01T08:05:00Z"), "Europe/London", SLOTS.versus)).toBe(true);
    expect(inSlot(new Date("2026-07-01T09:05:00Z"), "Europe/London", SLOTS.versus)).toBe(false);
  });

  it("reaches Auckland and Los Angeles at their own 7pm", () => {
    expect(inSlot(new Date("2026-10-29T06:15:00Z"), "Pacific/Auckland", SLOTS.streak)).toBe(true);
    expect(inSlot(new Date("2026-10-30T02:15:00Z"), "America/Los_Angeles", SLOTS.streak)).toBe(
      true,
    );
  });

  it("counts someone away after 30 days, or if never seen", () => {
    const at = new Date("2026-10-29T00:00:00Z");
    expect(isAway("2026-10-01T00:00:00Z", at)).toBe(false);
    expect(isAway("2026-09-28T00:00:00Z", at)).toBe(true);
    expect(isAway(null, at)).toBe(true);
  });

  it("reads each switch for its kind", () => {
    const off = { ...ALL_ON, loves: false };
    expect(wants(off, "love")).toBe(false);
    expect(wants(off, "follow")).toBe(true);
    expect(wants({ ...ALL_ON, drop: false }, "drop")).toBe(false);
  });

  it("keys by the hour and by the day", () => {
    const at = new Date("2026-10-29T08:42:00Z");
    expect(hourKey("album-7", at)).toBe("album-7:2026-10-29T08");
    expect(dayKey("user-1", at)).toBe("user-1:2026-10-29");
  });

  it("reminds only for a streak of two or more that today hasn't kept", () => {
    expect(streakDue({ days: 2, today: false, best: 2 })).toBe(true);
    expect(streakDue({ days: 1, today: false, best: 4 })).toBe(false);
    expect(streakDue({ days: 9, today: true, best: 9 })).toBe(false);
  });

  it("has a Diary switch", () => {
    expect(ALL_ON.diary).toBe(true);
    expect(wants({ ...ALL_ON, diary: false }, "diary")).toBe(false);
  });
});
