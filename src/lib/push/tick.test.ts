import { describe, expect, it, vi } from "vitest";
import { runTick, type TickDeps } from "@/lib/push/tick";
import { ALL_ON } from "@/lib/push/who";
import type { PushMessage } from "@/lib/push/messages";

vi.mock("@/lib/push/store", () => ({}));
vi.mock("@/lib/push/send", () => ({}));
vi.mock("@/lib/push/receipts", () => ({}));
vi.mock("@/lib/versus", () => ({
  sydneyDay: () => "2026-10-29",
  shiftDay: (day: string, n: number) => (n === -1 ? "2026-10-28" : day),
}));
vi.mock("@/lib/drop", () => ({
  currentDrop: () => ({
    week: 7,
    album: { mbid: "drop-mbid", title: "Blonde", artist: "Frank Ocean" },
  }),
}));
vi.mock("@/lib/streak", () => ({}));

const sydney = (userId: string, over = {}) => ({
  userId,
  timeZone: "Australia/Sydney",
  lastSeenAt: "2026-10-28T00:00:00Z",
  settings: { ...ALL_ON },
  ...over,
});

const today = {
  id: 2,
  day: "2026-10-29",
  title: "Under Pressure",
  tagline: "",
  left: { mbid: "l", name: "Queen", image: null },
  right: { mbid: "r", name: "Bowie", image: null },
};
const yesterday = {
  ...today,
  id: 1,
  day: "2026-10-28",
  title: "King of New York",
  left: { mbid: "n", name: "Nas", image: null },
};

function deps(over: Partial<TickDeps> = {}): TickDeps & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    candidates: vi.fn(async () => [sydney("a")]),
    todaysMatchup: vi.fn(async () => today),
    matchupForDay: vi.fn(async () => yesterday),
    picksIn: vi.fn(async () => new Set<string>()),
    countPicks: vi.fn(async () => ({ left: 58, right: 42 })),
    ratedAlbum: vi.fn(async () => new Set<string>()),
    loggedAlready: vi.fn(async () => new Set<string>()),
    streakOf: vi.fn(async () => ({ days: 12, today: false, best: 12 })),
    send: vi.fn(async (messages: PushMessage[]) => {
      sent.push(...messages);
      return messages.length;
    }),
    checkReceipts: vi.fn(async () => 0),
    pruneLog: vi.fn(async () => {}),
    ...over,
  };
}

// 09:05 on 29 Oct in Sydney.
const NINE = new Date("2026-10-28T22:05:00Z");
// 12:05 and 19:05 in Sydney.
const NOON = new Date("2026-10-29T01:05:00Z");
const SEVEN = new Date("2026-10-29T08:05:00Z");

describe("the clock", () => {
  it("sends today's Versus at 9am, keyed by the Sydney day", async () => {
    const d = deps();
    await runTick(NINE, d);
    expect(d.sent).toEqual([
      expect.objectContaining({
        userId: "a",
        kind: "versus",
        key: "2026-10-29",
        title: "Today's Versus: Under Pressure.",
      }),
    ]);
  });

  it("folds in yesterday's result for someone who picked", async () => {
    const d = deps({ picksIn: vi.fn(async () => new Set(["a"])) });
    await runTick(NINE, d);
    expect(d.sent[0]?.title).toBe("Nas took King of New York, 58–42.");
  });

  it("skips people away for a month, and anyone already sent today's", async () => {
    const d = deps({
      candidates: vi.fn(async () => [
        sydney("a", { lastSeenAt: "2026-09-01T00:00:00Z" }),
        sydney("b"),
      ]),
      loggedAlready: vi.fn(async () => new Set(["b"])),
    });
    await runTick(NINE, d);
    expect(d.sent).toEqual([]);
  });

  it("sends the Drop at noon, except to people who've rated it", async () => {
    const d = deps({
      candidates: vi.fn(async () => [sydney("a"), sydney("b")]),
      ratedAlbum: vi.fn(async () => new Set(["b"])),
    });
    await runTick(NOON, d);
    expect(d.sent).toEqual([expect.objectContaining({ userId: "a", kind: "drop", key: "week-7" })]);
  });

  it("reminds at 7pm only when the streak would end tonight", async () => {
    const d = deps({
      candidates: vi.fn(async () => [sydney("a"), sydney("b")]),
      streakOf: vi.fn(async (userId: string) =>
        userId === "a" ? { days: 12, today: false, best: 12 } : { days: 12, today: true, best: 12 },
      ),
    });
    await runTick(SEVEN, d);
    expect(d.sent).toEqual([
      expect.objectContaining({
        userId: "a",
        kind: "streak",
        key: "2026-10-29",
        title: "Your 12-day streak ends at midnight.",
      }),
    ]);
  });

  it("leaves out anyone who switched that kind off", async () => {
    const d = deps({
      candidates: vi.fn(async () => [sydney("a", { settings: { ...ALL_ON, versus: false } })]),
    });
    await runTick(NINE, d);
    expect(d.sent).toEqual([]);
  });

  it("checks receipts and prunes the log every run", async () => {
    const d = deps({ candidates: vi.fn(async () => []) });
    await runTick(NINE, d);
    expect(d.checkReceipts).toHaveBeenCalled();
    expect(d.pruneLog).toHaveBeenCalled();
  });
});
