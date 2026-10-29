import { describe, expect, it, vi } from "vitest";
import { runDiaryTick } from "./tick";

describe("runDiaryTick", () => {
  it("matches first, then moves Last.fm on, each within its share of the time", async () => {
    const order: string[] = [];
    const end = Date.now() + 30_000;
    const match = vi.fn(async (_at: Date, deadline: number) => {
      order.push("match");
      expect(deadline).toBeLessThanOrEqual(Date.now() + 15_000);
      return { matched: 2, missed: 1, errors: 0 };
    });
    const lastfm = vi.fn(async (_at: Date, deadline: number) => {
      order.push("lastfm");
      expect(deadline).toBe(end);
      return { people: 1, errors: 0 };
    });
    const sweep = vi.fn(async () => {
      order.push("sweep");
      return 3;
    });
    const report = await runDiaryTick(new Date(), end, { match, sweep, lastfm });
    expect(order).toEqual(["match", "sweep", "lastfm"]);
    expect(report).toEqual({ matched: 2, missed: 1, swept: 3, lastfmPeople: 1, errors: 0 });
  });

  it("carries on when the sweep fails", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const lastfm = vi.fn(async () => ({ people: 0, errors: 0 }));
    const report = await runDiaryTick(new Date(), Date.now() + 30_000, {
      match: vi.fn(async () => ({ matched: 0, missed: 0, errors: 0 })),
      sweep: vi.fn(async () => Promise.reject(new Error("slow"))),
      lastfm,
    });
    expect(lastfm).toHaveBeenCalled();
    expect(report.errors).toBe(1);
  });

  it("stops starting searches early enough for the last one to finish in time", async () => {
    const end = Date.now() + 20_000;
    const match = vi.fn(async (_at: Date, deadline: number) => {
      expect(deadline).toBeLessThanOrEqual(end - 15_000);
      return { matched: 0, missed: 0, errors: 0 };
    });
    await runDiaryTick(new Date(), end, {
      match,
      sweep: vi.fn(async () => 0),
      lastfm: vi.fn(async () => ({ people: 0, errors: 0 })),
    });
    expect(match).toHaveBeenCalled();
  });

  it("carries on with Last.fm when matching throws", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const lastfm = vi.fn(async () => ({ people: 0, errors: 0 }));
    const report = await runDiaryTick(new Date(), Date.now() + 30_000, {
      match: vi.fn(async () => Promise.reject(new Error("no table"))),
      sweep: vi.fn(async () => 0),
      lastfm,
    });
    expect(lastfm).toHaveBeenCalled();
    expect(report.errors).toBe(1);
  });

  it("counts Last.fm throwing as an error", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const report = await runDiaryTick(new Date(), Date.now() + 30_000, {
      match: vi.fn(async () => ({ matched: 0, missed: 0, errors: 1 })),
      sweep: vi.fn(async () => 0),
      lastfm: vi.fn(async () => Promise.reject(new Error("no keys"))),
    });
    expect(report.errors).toBe(2);
  });
});
