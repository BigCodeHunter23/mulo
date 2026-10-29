import { describe, expect, it, vi } from "vitest";
import { runTick, type TickDeps } from "@/lib/push/tick";
import { ALL_ON } from "@/lib/push/who";
import type { PushMessage } from "@/lib/push/messages";

vi.mock("@/lib/push/store", () => ({}));
vi.mock("@/lib/push/send", () => ({}));
vi.mock("@/lib/push/receipts", () => ({}));
vi.mock("@/lib/versus", () => ({
  sydneyDay: (at: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(at),
  shiftDay: (day: string, n: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10),
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
  it("sends today's Versus at 9am, keyed by the person's own day", async () => {
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

  it("leaves out a London person in the Sydney 9am window, and sends in their own", async () => {
    const london = (userId: string) => sydney(userId, { timeZone: "Europe/London" });
    const d = deps({ candidates: vi.fn(async () => [london("l")]) });
    await runTick(NINE, d);
    expect(d.sent).toEqual([]);
    // 09:05 on 29 Oct in London (GMT since 25 Oct).
    await runTick(new Date("2026-10-29T09:05:00Z"), d);
    expect(d.sent).toEqual([
      expect.objectContaining({ userId: "l", kind: "versus", key: "2026-10-29" }),
    ]);
  });

  it("gives the plain Versus wording to someone who didn't pick yesterday", async () => {
    const d = deps({ picksIn: vi.fn(async () => new Set(["someone-else"])) });
    await runTick(NINE, d);
    expect(d.sent[0]?.title).toBe("Today's Versus: Under Pressure.");
  });

  it("calls a tied Versus level", async () => {
    const d = deps({
      picksIn: vi.fn(async () => new Set(["a"])),
      countPicks: vi.fn(async () => ({ left: 5, right: 5 })),
    });
    await runTick(NINE, d);
    expect(d.sent[0]?.title).toBe("King of New York finished level, 50–50.");
  });

  it("sends nothing for a streak of 1", async () => {
    const d = deps({ streakOf: vi.fn(async () => ({ days: 1, today: false, best: 1 })) });
    await runTick(SEVEN, d);
    expect(d.sent).toEqual([]);
  });

  it("sends Versus once for a window that spans Sydney's midnight", async () => {
    const keys = new Set<string>();
    const d = deps({
      candidates: vi.fn(async () => [sydney("n", { timeZone: "America/St_Johns" })]),
      loggedAlready: vi.fn(async (kind: string, key: string) =>
        keys.has(`${kind}:${key}`) ? new Set(["n"]) : new Set<string>(),
      ),
      send: vi.fn(async (messages: PushMessage[]) => {
        for (const m of messages) keys.add(`${m.kind}:${m.key}`);
        return messages.length;
      }),
    });
    // 09:20 and 09:35 in St John's (UTC-3:30), either side of Sydney's midnight (13:00 UTC).
    await runTick(new Date("2026-11-05T12:50:00Z"), d);
    await runTick(new Date("2026-11-05T13:05:00Z"), d);
    expect(d.send).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ key: "2026-11-05" })],
      expect.any(Number),
    );
    expect(d.send).toHaveBeenNthCalledWith(2, [], expect.any(Number));
  });
});

describe("a run that goes wrong", () => {
  it("still sends Versus, checks receipts and prunes when a streak check throws", async () => {
    const d = deps({ streakOf: vi.fn(async () => Promise.reject(new Error("db down"))) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const versus = await runTick(NINE, d);
    expect(versus.errors).toBe(0);
    const report = await runTick(SEVEN, d);
    expect(report.errors).toBe(1);
    expect(d.checkReceipts).toHaveBeenCalledTimes(2);
    expect(d.pruneLog).toHaveBeenCalledTimes(2);
  });

  it("keeps the Versus push when the streak step fails in the same run", async () => {
    // Both slots at once: a person whose Versus and streak windows can't coincide, so two people.
    const d = deps({
      candidates: vi.fn(async () => [sydney("a"), sydney("z", { timeZone: "Pacific/Auckland" })]),
      streakOf: vi.fn(async () => {
        throw new Error("boom");
      }),
      loggedAlready: vi.fn(async (kind: string) => {
        if (kind === "streak") throw new Error("log down");
        return new Set<string>();
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // 09:05 Sydney; Auckland is 11:05 then, so only a is due.
    const report = await runTick(NINE, d);
    expect(d.sent).toHaveLength(1);
    expect(report.sent).toBe(1);
  });

  it("still runs receipts and prune when candidates throws", async () => {
    const d = deps({
      candidates: vi.fn(async () => {
        throw new Error("no db");
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await runTick(NINE, d);
    expect(report).toEqual({ due: 0, sent: 0, receipts: 0, errors: 1 });
    expect(d.checkReceipts).toHaveBeenCalled();
    expect(d.pruneLog).toHaveBeenCalled();
  });

  it("counts a failed send and a failed prune", async () => {
    const d = deps({
      send: vi.fn(async () => Promise.reject(new Error("expo down"))),
      pruneLog: vi.fn(async () => Promise.reject(new Error("prune"))),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await runTick(NINE, d);
    expect(report.errors).toBe(2);
    expect(d.checkReceipts).toHaveBeenCalled();
  });

  it("starts no streak checks, sending or receipts once the deadline has passed", async () => {
    const d = deps();
    const report = await runTick(SEVEN, d, { deadline: 0 });
    expect(d.streakOf).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.checkReceipts).not.toHaveBeenCalled();
    expect(d.pruneLog).toHaveBeenCalled();
    expect(report.errors).toBe(0);
  });

  it("hands its deadline to sending and to receipts", async () => {
    const d = deps();
    const deadline = Date.now() + 60_000;
    await runTick(NINE, d, { deadline });
    expect(d.send).toHaveBeenCalledWith(expect.any(Array), deadline);
    expect(d.checkReceipts).toHaveBeenCalledWith(NINE, deadline);
  });

  it("runs at most five streak checks at once", async () => {
    let running = 0;
    let peak = 0;
    const d = deps({
      candidates: vi.fn(async () => Array.from({ length: 12 }, (_, i) => sydney(`u${i}`))),
      streakOf: vi.fn(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 1));
        running -= 1;
        return { days: 5, today: false, best: 5 };
      }),
    });
    await runTick(SEVEN, d);
    expect(peak).toBe(5);
    expect(d.sent).toHaveLength(12);
  });
});
