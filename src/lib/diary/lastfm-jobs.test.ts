import { describe, expect, it, vi } from "vitest";
import type { Play } from "@/lib/diary-shared";
import { DIARY_FULL } from "./entries";
import { LastfmError, type RecentPage } from "./lastfm";
import {
  advanceLastfm,
  parseCarry,
  splitOldestDay,
  type LastfmDeps,
  type LastfmRow,
} from "./lastfm-jobs";

const at = new Date("2026-10-30T12:00:00Z");
const play = (iso: string, song: string): Play => ({
  at: Date.parse(iso),
  artist: "Frank Ocean",
  album: "Blonde",
  song,
  ms: null,
});
const row = (overrides: Partial<LastfmRow> = {}): LastfmRow => ({
  user_id: "u1",
  lastfm_user: "fran",
  state: "importing",
  import_to: "2026-10-30T11:00:00Z",
  import_page: 1,
  import_added: 0,
  carry: null,
  synced_to: "2026-10-30T11:00:00Z",
  time_zone: "UTC",
  ...overrides,
});

function deps(overrides: Partial<LastfmDeps> = {}): LastfmDeps {
  return {
    due: vi.fn(async () => [row()]),
    page: vi.fn(async (): Promise<RecentPage> => ({ page: 1, totalPages: 1, plays: [] })),
    timeZoneOf: vi.fn(async () => "UTC"),
    save: vi.fn(async () => ({ ok: true as const, added: 1, merged: 0, skipped: 0 })),
    update: vi.fn(async () => undefined),
    finished: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("splitOldestDay", () => {
  it("holds back the oldest day, which may go on over the next page", () => {
    const plays = [
      play("2026-10-12T10:00:00Z", "A"),
      play("2026-10-11T23:00:00Z", "B"),
      play("2026-10-11T22:00:00Z", "C"),
    ];
    const { done, carry } = splitOldestDay(plays, "UTC");
    expect(done.map((p) => p.song)).toEqual(["A"]);
    expect(carry.map((p) => p.song)).toEqual(["B", "C"]);
  });

  it("goes by the listener's own day", () => {
    // 23:00 UTC on the 11th is already the 12th in Sydney: one day, all held back.
    const plays = [play("2026-10-12T10:00:00Z", "A"), play("2026-10-11T23:00:00Z", "B")];
    expect(splitOldestDay(plays, "UTC").carry.map((p) => p.song)).toEqual(["B"]);
    expect(splitOldestDay(plays, "Australia/Sydney")).toEqual({ done: [], carry: plays });
    expect(splitOldestDay([], "UTC")).toEqual({ done: [], carry: [] });
  });
});

describe("parseCarry", () => {
  it("keeps plays as this file wrote them, and drops anything else", () => {
    const plays = [
      play("2026-10-11T10:00:00Z", "E"),
      { ...play("2026-10-11T11:00:00Z", "F"), ms: 9 },
    ];
    expect(parseCarry(plays)).toEqual(plays);
    expect(parseCarry(null)).toEqual([]);
    expect(parseCarry({ at: 1 })).toEqual([]);
    expect(parseCarry([{ at: "soon", artist: "A", album: "B", song: "C", ms: null }])).toEqual([]);
    expect(parseCarry([{ at: 1, artist: 2, album: "B", song: "C", ms: null }])).toEqual([]);
  });
});

describe("advanceLastfm", () => {
  it("imports a page, carrying the oldest day over, and moves to the next page", async () => {
    const d = deps({
      page: vi.fn(async () => ({
        page: 1,
        totalPages: 2,
        plays: ["A", "B", "C", "D"]
          .map((s) => play("2026-10-12T10:00:00Z", s))
          .concat(play("2026-10-11T10:00:00Z", "E")),
      })),
    });
    await advanceLastfm(at, Date.now() + 10_000, d, { pagesPerTurn: 1 });
    expect(d.page).toHaveBeenCalledWith("fran", {
      page: 1,
      to: Date.parse("2026-10-30T11:00:00Z") / 1000,
    });
    expect(d.save).toHaveBeenCalledWith("u1", [
      expect.objectContaining({ day: "2026-10-12", songs: 4 }),
    ]);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        import_page: 2,
        import_added: 1,
        carry: [expect.objectContaining({ song: "E" })],
        reached_back: "2026-10-11T10:00:00.000Z",
      }),
    );
    expect(d.finished).not.toHaveBeenCalled();
  });

  it("finishes the import on its last page and tells the person", async () => {
    const d = deps({
      due: vi.fn(async () => [
        row({ import_page: 2, import_added: 40, carry: [play("2026-10-11T10:00:00Z", "E")] }),
      ]),
      page: vi.fn(async () => ({ page: 2, totalPages: 2, plays: [] })),
      save: vi.fn(async () => ({ ok: true as const, added: 0, merged: 0, skipped: 0 })),
    });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ state: "syncing", import_page: null, carry: null }),
    );
    expect(d.finished).toHaveBeenCalledWith("u1", 40);
  });

  it("finishes at once for an account with nothing played", async () => {
    const d = deps({
      page: vi.fn(async () => ({ page: 1, totalPages: 0, plays: [] })),
      save: vi.fn(async () => ({ ok: true as const, added: 0, merged: 0, skipped: 0 })),
    });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.update).toHaveBeenCalledWith("u1", expect.objectContaining({ state: "syncing" }));
    expect(d.finished).toHaveBeenCalledWith("u1", 0);
  });

  it("goes on past an empty page before the last, keeping the day it carries", async () => {
    const carried = [play("2026-10-11T10:00:00Z", "E")];
    const d = deps({
      due: vi.fn(async () => [row({ import_page: 3, carry: carried })]),
      page: vi.fn(async () => ({ page: 3, totalPages: 9, plays: [] })),
    });
    await advanceLastfm(at, Date.now() + 10_000, d, { pagesPerTurn: 1 });
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ import_page: 4, carry: carried }),
    );
    expect(d.finished).not.toHaveBeenCalled();
  });

  it("tries a page again next run when Last.fm doesn't say how many there are", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const d = deps({
      due: vi.fn(async () => [row({ import_page: 3 })]),
      page: vi.fn(async () => ({
        page: 3,
        totalPages: null,
        plays: [play("2026-10-12T10:00:00Z", "A")],
      })),
    });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(report.errors).toBe(1);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.finished).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalledWith("u1", { worked_at: at.toISOString() });
  });

  it("reads days on the clock kept with the import, wherever the person is now", async () => {
    // 23:00 UTC on the 11th is the 12th in Sydney.
    const d = deps({
      due: vi.fn(async () => [row({ time_zone: "Australia/Sydney" })]),
      page: vi.fn(async () => ({
        page: 1,
        totalPages: 1,
        plays: ["A", "B", "C", "D"].map((s) => play("2026-10-11T23:00:00Z", s)),
      })),
      timeZoneOf: vi.fn(async () => "America/New_York"),
    });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.timeZoneOf).not.toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith("u1", [expect.objectContaining({ day: "2026-10-12" })]);
  });

  it("keeps the person's zone with an import that has none, so it stays put", async () => {
    const d = deps({
      due: vi.fn(async () => [row({ time_zone: null })]),
      page: vi.fn(async () => ({
        page: 1,
        totalPages: 2,
        plays: [play("2026-10-12T10:00:00Z", "A"), play("2026-10-11T10:00:00Z", "B")],
      })),
      timeZoneOf: vi.fn(async () => "Europe/London"),
    });
    await advanceLastfm(at, Date.now() + 10_000, d, { pagesPerTurn: 1 });
    expect(d.timeZoneOf).toHaveBeenCalledWith("u1");
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ time_zone: "Europe/London" }),
    );
  });

  it("syncs by reading back 26 hours, and moves synced_to on", async () => {
    const d = deps({ due: vi.fn(async () => [row({ state: "syncing", import_page: null })]) });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.page).toHaveBeenCalledWith("fran", {
      page: 1,
      from: (Date.parse("2026-10-30T11:00:00Z") - 26 * 3_600_000) / 1000,
    });
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ synced_to: at.toISOString() }),
    );
  });

  it("reads every page of a sync, newest first", async () => {
    const page = vi.fn(async (_user: string, options: { page: number }) => ({
      page: options.page,
      totalPages: 3,
      plays: [play(`2026-10-30T0${options.page}:00:00Z`, `S${options.page}`)],
    }));
    const d = deps({ due: vi.fn(async () => [row({ state: "syncing" })]), page });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(page.mock.calls.map(([, options]) => options.page)).toEqual([1, 2, 3]);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ synced_to: at.toISOString() }),
    );
  });

  it("reads a sync too far behind for one turn oldest first, and moves on as far as it got", async () => {
    // Weeks behind (say, connected again after a while): 50 pages since.
    const page = vi.fn(async (_user: string, options: { page: number }) => ({
      page: options.page,
      totalPages: 50,
      plays:
        options.page === 1
          ? [play("2026-10-30T11:00:00Z", "newest")]
          : [play(`2026-10-0${51 - options.page}T10:00:00Z`, `S${options.page}`)],
    }));
    const d = deps({
      due: vi.fn(async () => [row({ state: "syncing", synced_to: "2026-10-01T00:00:00Z" })]),
      page,
    });
    await advanceLastfm(at, Date.now() + 10_000, d, { pagesPerTurn: 3 });
    expect(page.mock.calls.map(([, options]) => options.page)).toEqual([1, 50, 49]);
    expect(d.update).toHaveBeenCalledWith("u1", {
      worked_at: at.toISOString(),
      synced_to: "2026-10-02T10:00:00.000Z",
    });
  });

  it("ends an import when the diary fills up partway through a page", async () => {
    const d = deps({
      due: vi.fn(async () => [row({ import_page: 3, import_added: 120 })]),
      page: vi.fn(async () => ({
        page: 3,
        totalPages: 9,
        plays: [play("2026-10-12T10:00:00Z", "A"), play("2026-10-11T10:00:00Z", "B")],
      })),
      save: vi.fn(async () => ({ ok: true as const, added: 2, merged: 0, skipped: 5 })),
    });
    await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.page).toHaveBeenCalledTimes(1);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ state: "syncing", import_page: null, import_added: 122 }),
    );
    expect(d.finished).toHaveBeenCalledWith("u1", 122);
  });

  it("ends an import when the diary is full, rather than asking Last.fm again every run", async () => {
    const d = deps({
      due: vi.fn(async () => [row({ import_page: 3, import_added: 120 })]),
      page: vi.fn(async () => ({
        page: 3,
        totalPages: 9,
        plays: [play("2026-10-12T10:00:00Z", "A"), play("2026-10-11T10:00:00Z", "B")],
      })),
      save: vi.fn(async () => ({ ok: false as const, error: DIARY_FULL })),
    });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.page).toHaveBeenCalledTimes(1);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        state: "syncing",
        import_page: null,
        import_added: 120,
        carry: null,
      }),
    );
    expect(d.finished).toHaveBeenCalledWith("u1", 120);
    expect(report).toEqual({ people: 1, errors: 0 });
  });

  it("moves a sync on when the diary is full", async () => {
    const d = deps({
      due: vi.fn(async () => [row({ state: "syncing" })]),
      page: vi.fn(async () => ({
        page: 1,
        totalPages: 1,
        plays: [play("2026-10-30T10:00:00Z", "A")],
      })),
      save: vi.fn(async () => ({ ok: false as const, error: DIARY_FULL })),
    });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ synced_to: at.toISOString() }),
    );
    expect(report).toEqual({ people: 1, errors: 0 });
  });

  it("asks to reconnect when Last.fm won't read the account", async () => {
    const d = deps({ page: vi.fn(async () => Promise.reject(new LastfmError(17, "private"))) });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(d.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ state: "needs_reconnect" }),
    );
    expect(report).toEqual({ people: 1, errors: 0 });
  });

  it("leaves a passing failure for the next run", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const d = deps({ page: vi.fn(async () => Promise.reject(new LastfmError(29, "busy"))) });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(report.errors).toBe(1);
    expect(d.update).toHaveBeenCalledWith("u1", { worked_at: at.toISOString() });
  });

  it("won't sync on a page count Last.fm didn't give", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const d = deps({
      due: vi.fn(async () => [row({ state: "syncing" })]),
      page: vi.fn(async () => ({
        page: 1,
        totalPages: null,
        plays: [play("2026-10-30T10:00:00Z", "A")],
      })),
    });
    const report = await advanceLastfm(at, Date.now() + 10_000, d);
    expect(report.errors).toBe(1);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalledWith("u1", { worked_at: at.toISOString() });
  });

  it("starts nobody new after the deadline", async () => {
    const d = deps();
    await advanceLastfm(at, Date.now() - 1, d);
    expect(d.due).not.toHaveBeenCalled();
    expect(d.page).not.toHaveBeenCalled();
  });
});
