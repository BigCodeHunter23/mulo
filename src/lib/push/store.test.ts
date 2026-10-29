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
  forgetDevice,
  logKey,
  markChecked,
  peopleNamed,
  peoplePushesSince,
  personOf,
  pushCopyOf,
  readTimeZone,
  replyTarget,
  saveMentions,
  tickCandidates,
  toColumns,
  uncheckedTickets,
  toSettings,
  touchClock,
} from "@/lib/push/store";
import { ALL_ON } from "@/lib/push/who";
import { sydneyDay } from "@/lib/versus";

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
    expect(logKey({ userId: "u", kind: "follow", key: "k" })).toBe("u|follow|k");
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

describe("forgetDevice", () => {
  it("deletes the phone by its token alone, whoever it belongs to", async () => {
    const calls: [string, unknown[]][] = [];
    const from = vi.fn(() => query({ error: null }, calls));
    client.current = { from };
    await forgetDevice("ExponentPushToken[x]");
    expect(from).toHaveBeenCalledWith("push_devices");
    expect(calls).toEqual([
      ["delete", []],
      ["eq", ["token", "ExponentPushToken[x]"]],
    ]);
  });

  it("throws a failed delete", async () => {
    const failure = new Error("down");
    client.current = { from: () => query({ error: failure }) };
    await expect(forgetDevice("ExponentPushToken[x]")).rejects.toBe(failure);
  });
});

describe("peoplePushesSince", () => {
  it("counts one person's follow, love and reply pushes since a moment", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = { from: () => query({ count: 4, error: null }, calls) };
    expect(await peoplePushesSince("u", new Date("2026-10-29T07:00:00Z"))).toBe(4);
    expect(calls).toContainEqual(["select", ["user_id", { count: "exact", head: true }]]);
    expect(calls).toContainEqual(["eq", ["user_id", "u"]]);
    expect(calls).toContainEqual(["in", ["kind", ["follow", "love", "reply"]]]);
    expect(calls).toContainEqual(["gt", ["sent_at", "2026-10-29T07:00:00.000Z"]]);
  });

  it("throws a failed count", async () => {
    const failure = new Error("down");
    client.current = { from: () => query({ count: null, error: failure }) };
    await expect(peoplePushesSince("u", new Date())).rejects.toBe(failure);
  });
});

describe("uncheckedTickets", () => {
  it("reads the oldest first, and keeps only tickets of the right shape", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = {
      from: () =>
        query(
          {
            data: [
              {
                user_id: "a",
                kind: "follow",
                key: "k",
                tickets: [
                  { id: "t1", token: "T1" },
                  { id: 2, token: "T2" },
                  null,
                  "x",
                  { id: "t3" },
                ],
              },
              { user_id: "b", kind: "love", key: "l", tickets: { id: "t4", token: "T4" } },
            ],
            error: null,
          },
          calls,
        ),
    };
    expect(await uncheckedTickets(new Date())).toEqual([
      { userId: "a", kind: "follow", key: "k", tickets: [{ id: "t1", token: "T1" }] },
      { userId: "b", kind: "love", key: "l", tickets: [] },
    ]);
    expect(calls).toContainEqual(["order", ["sent_at"]]);
  });
});

describe("pushCopyOf", () => {
  it("answers the settings and the phones, without their tokens", async () => {
    const calls: Record<string, [string, unknown[]][]> = {
      personal_settings: [],
      push_devices: [],
    };
    const settings = {
      time_zone: "Europe/London",
      last_seen_at: "2026-10-29T08:00:00Z",
      notify_follows: true,
      notify_loves: false,
      notify_replies: true,
      notify_versus: true,
      notify_drop: true,
      notify_streak: false,
    };
    const phones = [
      { platform: "ios", created_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-29T08:00:00Z" },
    ];
    client.current = {
      from: (table: string) =>
        query(
          { data: table === "push_devices" ? phones : settings, error: null },
          calls[table] ?? [],
        ),
    };
    expect(await pushCopyOf("u")).toEqual({ settings, phones });
    const selected = calls.push_devices?.find(([name]) => name === "select")?.[1][0];
    expect(selected).toBe("platform, created_at, last_seen_at");
    expect(String(selected)).not.toContain("token");
    expect(calls.push_devices).toContainEqual(["eq", ["user_id", "u"]]);
    expect(calls.personal_settings).toContainEqual(["eq", ["user_id", "u"]]);
  });

  it("answers no settings for somebody who never changed any", async () => {
    client.current = { from: () => query({ data: null, error: null }) };
    expect(await pushCopyOf("u")).toEqual({ settings: null, phones: [] });
  });

  it("throws a failed read", async () => {
    const failure = new Error("down");
    client.current = { from: () => query({ data: null, error: failure }) };
    await expect(pushCopyOf("u")).rejects.toBe(failure);
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

describe("replyTarget", () => {
  it("names a written album review's owner and record", async () => {
    client.current = {
      from: () =>
        query({
          data: {
            user_id: A,
            release_mbid: "m1",
            review: "Good.",
            profiles: { username: "sam", display_name: "Sam" },
            releases: { title: "Blonde" },
          },
          error: null,
        }),
    };
    expect(await replyTarget("album", 7)).toEqual({
      ownerId: A,
      owner: { username: "sam", display_name: "Sam" },
      subject: { kind: "album", mbid: "m1", id: 7, title: "Blonde" },
      openMatchup: null,
    });
  });

  it("has nothing for a score with no words, or nothing at all", async () => {
    client.current = {
      from: () =>
        query({
          data: {
            user_id: A,
            release_mbid: "m1",
            review: null,
            profiles: { username: "sam", display_name: null },
            releases: { title: "Blonde" },
          },
          error: null,
        }),
    };
    expect(await replyTarget("album", 7)).toBeNull();
    client.current = { from: () => query({ data: null, error: null }) };
    expect(await replyTarget("artist", 8)).toBeNull();
  });

  it("marks a take on today's Versus as still open", async () => {
    const side = (mbid: string, name: string) => ({ mbid, name, image_url: null });
    client.current = {
      from: () =>
        query({
          data: {
            user_id: A,
            profiles: { username: "sam", display_name: "Sam" },
            versus_matchups: {
              id: 3,
              day: sydneyDay(),
              left: side("11111111-1111-4111-8111-111111111111", "Nas"),
              right: side("22222222-2222-4222-8222-222222222222", "Jay-Z"),
            },
          },
          error: null,
        }),
    };
    expect(await replyTarget("take", 9)).toMatchObject({
      ownerId: A,
      subject: { kind: "take", day: sydneyDay(), id: 9 },
      openMatchup: 3,
    });
  });
});

describe("peopleNamed", () => {
  it("finds people by name in any case, keeping exact names only", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = {
      from: () =>
        query(
          {
            data: [
              { id: A, username: "Sam", display_name: "Sam" },
              { id: B, username: "j_o", display_name: null },
            ],
            error: null,
          },
          calls,
        ),
    };
    expect(await peopleNamed(["sam", "jxo"])).toEqual([
      { id: A, username: "Sam", display_name: "Sam" },
    ]);
    expect(calls).toContainEqual(["or", ["username.ilike.sam,username.ilike.jxo"]]);
  });

  it("escapes underscores, so a name of underscores can't match everyone", async () => {
    const calls: [string, unknown[]][] = [];
    client.current = { from: () => query({ data: [], error: null }, calls) };
    await peopleNamed(["a_c", "___"]);
    expect(calls).toContainEqual(["or", ["username.ilike.a\\_c,username.ilike.\\_\\_\\_"]]);
  });

  it("asks nothing for no names, or names that can't be usernames", async () => {
    client.current = null;
    expect(await peopleNamed([])).toEqual([]);
    expect(await peopleNamed(["a,b", "x"])).toEqual([]);
  });
});

describe("saveMentions", () => {
  it("keeps a row for each person named, with the service role", async () => {
    const calls: [string, unknown[]][] = [];
    const from = vi.fn(() => query({ data: null, error: null }, calls));
    client.current = { from };
    await saveMentions(41, [A, B]);
    expect(from).toHaveBeenCalledWith("reply_mentions");
    expect(calls).toContainEqual([
      "insert",
      [
        [
          { reply_id: 41, user_id: A },
          { reply_id: 41, user_id: B },
        ],
      ],
    ]);
  });

  it("asks nothing for nobody, and throws a failed write", async () => {
    await saveMentions(41, []);
    client.current = { from: () => query({ data: null, error: { code: "57014" } }) };
    await expect(saveMentions(41, [A])).rejects.toEqual({ code: "57014" });
  });
});
