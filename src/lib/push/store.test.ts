import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (!client.current) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return client.current;
  }),
}));

import {
  blockedEitherWay,
  devicesOf,
  logKey,
  markChecked,
  personOf,
  readTimeZone,
  tickCandidates,
  toColumns,
  toSettings,
  touchClock,
} from "@/lib/push/store";
import { ALL_ON } from "@/lib/push/who";

beforeEach(() => {
  client.current = null;
});

/** A query that can be chained any way and answers `result` when awaited. */
function query(result: unknown, calls: [string, unknown[]][] = []) {
  const chain: unknown = new Proxy(() => {}, {
    get(_target, name) {
      if (name === "then") return (resolve: (v: unknown) => void) => resolve(result);
      return (...args: unknown[]) => {
        calls.push([String(name), args]);
        return chain;
      };
    },
  });
  return chain;
}

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";

describe("readTimeZone", () => {
  it("answers null, rather than throwing, when the database can't be reached", async () => {
    expect(await readTimeZone("u")).toBeNull();
  });
});

describe("toSettings, toColumns and logKey", () => {
  it("treats a missing row as everything on", () => {
    expect(toSettings(null)).toEqual(ALL_ON);
    expect(toSettings(undefined)).toEqual(ALL_ON);
  });

  it("reads a row's switches", () => {
    expect(
      toSettings({
        notify_follows: false,
        notify_loves: true,
        notify_replies: true,
        notify_versus: false,
        notify_drop: true,
        notify_streak: false,
      }),
    ).toEqual({
      follows: false,
      loves: true,
      replies: true,
      versus: false,
      drop: true,
      streak: false,
    });
  });

  it("maps only the switches given to their columns", () => {
    expect(toColumns({ drop: false, streak: true })).toEqual({
      notify_drop: false,
      notify_streak: true,
    });
    expect(toColumns({})).toEqual({});
  });

  it("keys a log entry by person, kind and key", () => {
    expect(logKey({ userId: "u", kind: "follow", key: "k" })).toBe("u|follows|k");
  });
});

describe("blockedEitherWay", () => {
  it("asks the blocks table for a row in either direction", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = {
      from: vi.fn(() => query({ data: [{ blocker_id: B }], error: null }, calls)),
    };
    expect(await blockedEitherWay(A, B)).toBe(true);
    expect(calls).toContainEqual([
      "or",
      [`and(blocker_id.eq.${A},blocked_id.eq.${B}),and(blocker_id.eq.${B},blocked_id.eq.${A})`],
    ]);
    expect(calls).toContainEqual(["limit", [1]]);
  });

  it("answers false when nobody blocked anybody", async () => {
    client.current = { from: () => query({ data: [], error: null }) };
    expect(await blockedEitherWay(A, B)).toBe(false);
  });

  it("answers false before the blocks table exists, and true on any other error", async () => {
    client.current = { from: () => query({ data: null, error: { code: "42P01" } }) };
    expect(await blockedEitherWay(A, B)).toBe(false);
    client.current = { from: () => query({ data: null, error: { code: "57014" } }) };
    expect(await blockedEitherWay(A, B)).toBe(true);
  });

  it("stays quiet, without asking, when an id isn't a uuid", async () => {
    const from = vi.fn();
    client.current = { from };
    expect(await blockedEitherWay(A, "x),or(1=1")).toBe(true);
    expect(await blockedEitherWay("nope", B)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("long lists", () => {
  it("reads people in chunks of 100", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = { from: () => query({ data: [], error: null }, calls) };
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    await devicesOf(ids);
    const sizes = calls.filter(([n]) => n === "in").map(([, a]) => (a[1] as string[]).length);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it("pages through every device, then reads settings in chunks", async () => {
    const ranges: unknown[][] = [];
    const settingsChunks: number[] = [];
    const device = (i: number) => ({ user_id: `u${i}` });
    client.current = {
      from: (table: string) => {
        if (table === "push_devices") {
          return {
            select: () => ({
              order: () => ({
                range: (from: number, to: number) => {
                  ranges.push([from, to]);
                  const count = from === 0 ? 1000 : 500;
                  return Promise.resolve({
                    data: Array.from({ length: count }, (_, i) => device(from + i)),
                    error: null,
                  });
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: (_c: string, chunk: string[]) => {
              settingsChunks.push(chunk.length);
              return Promise.resolve({ data: [], error: null });
            },
          }),
        };
      },
    };
    await tickCandidates();
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(settingsChunks.reduce((a, b) => a + b, 0)).toBe(1500);
    expect(Math.max(...settingsChunks)).toBe(100);
  });
});

describe("errors are reported, not swallowed", () => {
  it("markChecked updates once per kind and key, and throws the first failure", async () => {
    const calls: [string, unknown[]][] = [];
    const failure = new Error("boom");
    let n = 0;
    client.current = {
      from: () => query({ error: ++n === 2 ? failure : null }, calls),
    };
    await expect(
      markChecked([
        { userId: "a", kind: "love", key: "1" },
        { userId: "b", kind: "love", key: "1" },
        { userId: "c", kind: "drop", key: "2" },
      ]),
    ).rejects.toBe(failure);
    const updates = calls.filter(([name]) => name === "update");
    expect(updates).toHaveLength(2);
    expect(calls).toContainEqual(["in", ["user_id", ["a", "b"]]]);
  });

  it("touchClock throws a failed read", async () => {
    const failure = new Error("read failed");
    client.current = { from: () => query({ data: null, error: failure }) };
    await expect(touchClock("u", "Europe/London")).rejects.toBe(failure);
  });

  it("personOf tells a failed read from nobody", async () => {
    const failure = new Error("read failed");
    client.current = { from: () => query({ data: null, error: failure }) };
    await expect(personOf("u")).rejects.toBe(failure);
    client.current = { from: () => query({ data: null, error: null }) };
    expect(await personOf("u")).toBeNull();
  });
});
