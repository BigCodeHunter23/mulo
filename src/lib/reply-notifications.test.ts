import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/versus", () => ({
  MATCHUP_SELECT: "id, day",
  toMatchup: (row: { id: number; day: string }) => ({
    id: row.id,
    day: row.day,
    title: "Under Pressure",
    tagline: "",
    left: { mbid: "l", name: "Nas", image: null },
    right: { mbid: "r", name: "Jay-Z", image: null },
  }),
}));

import { createClient } from "@/lib/supabase/server";
import {
  getReplyNotifications,
  latestReplyActivityAt,
  replyBell,
  THREADS_FOLLOWED,
  toBellReply,
  type BellReply,
  type BellRow,
  type BellThread,
} from "@/lib/reply-notifications";

const me = { id: "me" };
const person = (id: string) => ({ id, username: id, display_name: null, avatar_url: null });
const mine: BellThread = {
  kind: "album",
  id: 7,
  ownerId: "me",
  owner: "Me",
  title: "Blonde",
  href: "/album/m1/reviews/7",
};
const sams: BellThread = {
  ...mine,
  id: 8,
  ownerId: "sam",
  owner: "Sam",
  href: "/album/m1/reviews/8",
};
const take: BellThread = {
  kind: "take",
  id: 9,
  ownerId: "sam",
  owner: "Sam",
  title: "Under Pressure",
  href: "/versus/2026-10-29/takes/9",
};
const reply = (id: number, by: string, hour: number, over: Partial<BellReply> = {}): BellReply => ({
  id,
  body: "Yes.",
  at: `2026-10-29T${String(hour).padStart(2, "0")}:00:00Z`,
  person: person(by),
  thread: mine,
  ...over,
});
const none = { onMine: [], mentions: [], followUps: [], myLatest: new Map<string, string>() };

describe("replyBell", () => {
  it("puts replies on your own review in one line, the newest replier first", () => {
    const out = replyBell(me, {
      ...none,
      onMine: [reply(1, "joe", 1), reply(2, "kim", 3), reply(3, "joe", 2), reply(4, "me", 4)],
    });
    expect(out).toEqual([
      {
        kind: "reply",
        key: "reply-album-7",
        at: "2026-10-29T03:00:00Z",
        person: person("kim"),
        others: 1,
        on: "review",
        subject: { title: "Blonde", href: "/album/m1/reviews/7" },
      },
    ]);
  });

  it("tells you you were named in somebody else's thread, once", () => {
    const named = reply(5, "joe", 5, { body: "@me_1 look", thread: take });
    const out = replyBell(me, {
      ...none,
      mentions: [
        named,
        named,
        // On your own review it's already a reply line; your own words aren't news.
        reply(7, "joe", 7, { body: "@Me_1 yours" }),
        reply(8, "me", 8, { thread: take }),
      ],
    });
    expect(out).toEqual([
      {
        kind: "mention",
        key: "mention-5",
        at: "2026-10-29T05:00:00Z",
        person: person("joe"),
        owner: "Sam",
        on: "take",
        subject: { title: "Under Pressure", href: "/versus/2026-10-29/takes/9" },
      },
    ]);
  });

  it("counts what's come since your own last reply in a thread, leaving out where you were named", () => {
    const named = reply(12, "kim", 12, { body: "@me_1 yes", thread: sams });
    const out = replyBell(me, {
      ...none,
      mentions: [named],
      followUps: [
        reply(10, "joe", 9, { thread: sams }),
        reply(11, "joe", 11, { thread: sams }),
        named,
        reply(13, "lee", 13, { thread: sams }),
        reply(14, "me", 14, { thread: sams }),
      ],
      myLatest: new Map([["album-8", "2026-10-29T10:00:00Z"]]),
    });
    expect(out.filter((n) => n.kind === "thread")).toEqual([
      {
        kind: "thread",
        key: "thread-album-8",
        at: "2026-10-29T13:00:00Z",
        person: person("lee"),
        count: 2,
        owner: "Sam",
        on: "review",
        subject: { title: "Blonde", href: "/album/m1/reviews/8" },
      },
    ]);
    expect(out.filter((n) => n.kind === "mention")).toHaveLength(1);
  });
});

describe("toBellReply", () => {
  const base = {
    id: 1,
    body: "Yes.",
    created_at: "2026-10-29T01:00:00Z",
    user_id: "joe",
    profiles: person("joe"),
  };

  it("names an album review's thread", () => {
    expect(
      toBellReply({
        ...base,
        ratings: {
          id: 7,
          user_id: "sam",
          release_mbid: "m1",
          releases: { title: "Blonde" },
          profiles: { username: "sam", display_name: "Sam" },
        },
      }),
    ).toEqual({
      id: 1,
      body: "Yes.",
      at: "2026-10-29T01:00:00Z",
      person: person("joe"),
      thread: {
        kind: "album",
        id: 7,
        ownerId: "sam",
        owner: "Sam",
        title: "Blonde",
        href: "/album/m1/reviews/7",
      },
    });
  });

  it("names an artist review's and a take's", () => {
    expect(
      toBellReply({
        ...base,
        artist_ratings: {
          id: 8,
          user_id: "sam",
          artist_mbid: "a1",
          artists: { name: "Frank Ocean" },
          profiles: { username: "sam", display_name: null },
        },
      })?.thread,
    ).toEqual({
      kind: "artist",
      id: 8,
      ownerId: "sam",
      owner: "sam",
      title: "Frank Ocean",
      href: "/artist/a1/reviews/8",
    });
    expect(
      toBellReply({
        ...base,
        versus_takes: {
          id: 9,
          user_id: "sam",
          profiles: { username: "sam", display_name: "Sam" },
          versus_matchups: { id: 3, day: "2026-10-29" } as never,
        },
      })?.thread,
    ).toEqual({
      kind: "take",
      id: 9,
      ownerId: "sam",
      owner: "Sam",
      title: "Under Pressure",
      href: "/versus/2026-10-29/takes/9",
    });
  });

  it("drops a reply whose thread it can't name", () => {
    expect(toBellReply(base)).toBeNull();
  });
});

describe("reading the bell's reply lines", () => {
  let fake: FakeSupabase;
  const NEWEST = { ascending: false };

  beforeEach(() => {
    fake = fakeSupabase();
    vi.mocked(createClient).mockResolvedValue(fake.client as never);
  });

  const row = (id: number, by: string, hour: number, thread = 7, owner = "me"): BellRow => ({
    id,
    body: "Yes.",
    created_at: `2026-10-29T${String(hour).padStart(2, "0")}:00:00Z`,
    user_id: by,
    profiles: person(by),
    ratings: {
      id: thread,
      user_id: owner,
      release_mbid: "m1",
      releases: { title: "Blonde" },
      profiles: { username: owner, display_name: null },
    },
    artist_ratings: null,
    versus_takes: null,
  });
  /** One of your own replies, as the bell reads them to find your threads. */
  const mine = (thread: number, hour: number, owner = "sam", column = "rating_id") => ({
    rating_id: null,
    artist_rating_id: null,
    versus_take_id: null,
    [column]: thread,
    thread_owner_id: owner,
    created_at: `2026-10-29T${String(hour).padStart(2, "0")}:00:00Z`,
  });
  const ok = (data: unknown) => ({ data, error: null });
  const reads = () => fake.calls.filter((call) => call.method === "from");

  it("reads each kind of line once, mentions from who was named, in four reads", async () => {
    fake.answer(
      "replies",
      ok([row(1, "joe", 9)]),
      ok([mine(8, 10), mine(8, 4), mine(9, 6, "kim", "versus_take_id")]),
      ok([row(3, "lee", 11, 8, "sam")]),
    );
    fake.answer("reply_mentions", ok([{ replies: row(2, "kim", 12, 8, "sam") }]));

    const lines = await getReplyNotifications("me", 20);

    expect(lines.map((line) => [line.kind, line.key])).toEqual([
      ["reply", "reply-album-7"],
      ["mention", "mention-2"],
      ["thread", "thread-album-8"],
    ]);
    expect(reads()).toHaveLength(4);
    expect(fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "eq",
      args: ["thread_owner_id", "me"],
    });
    const mentions = fake.callsOn("reply_mentions");
    expect(mentions).toContainEqual({
      table: "reply_mentions",
      method: "eq",
      args: ["user_id", "me"],
    });
    expect(mentions).toContainEqual({
      table: "reply_mentions",
      method: "order",
      args: ["reply_id", NEWEST],
    });
    expect(fake.calls.some((call) => call.method === "ilike")).toBe(false);
    // Only what's newer than your own latest, thread by thread.
    expect(fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "or",
      args: [
        'and(rating_id.eq.8,created_at.gt."2026-10-29T10:00:00Z"),' +
          'and(versus_take_id.eq.9,created_at.gt."2026-10-29T06:00:00Z")',
      ],
    });
  });

  it("follows your fifty most recent threads, not your own reviews", async () => {
    const yours = Array.from({ length: 60 }, (_, i) => mine(100 + i, 23 - Math.floor(i / 3)));
    fake.answer("replies", ok([]), ok([mine(7, 23, "me"), ...yours]), ok([]));
    await getReplyNotifications("me");
    const or = fake.callsOn("replies").find((call) => call.method === "or");
    const filter = String(or?.args[0]);
    expect(THREADS_FOLLOWED).toBe(50);
    expect(filter.split("),and(")).toHaveLength(50);
    expect(filter.startsWith('and(rating_id.eq.100,created_at.gt."2026-10-29T23:00:00Z")')).toBe(
      true,
    );
    expect(filter).toContain("rating_id.eq.149,");
    expect(filter).not.toContain("rating_id.eq.150,");
    expect(filter).not.toContain("rating_id.eq.7,");
  });

  it("reads no follow-ups when you've replied nowhere", async () => {
    await getReplyNotifications("me");
    expect(reads()).toHaveLength(3);
  });

  it("logs a failed read and carries on with the rest", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.answer("replies", { data: null, error: { code: "57014", message: "timeout" } });
    fake.answer("reply_mentions", ok([{ replies: row(2, "kim", 12, 8, "sam") }]));
    expect((await getReplyNotifications("me")).map((line) => line.kind)).toEqual(["mention"]);
    expect(logged).toHaveBeenCalledWith("[replies] query failed:", "57014", "timeout");
  });

  it("says nothing, and logs nothing, before the replies migration has run", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = { data: null, error: { code: "PGRST205", message: "no table" } };
    fake.answer("replies", missing, missing);
    fake.answer("reply_mentions", missing);
    expect(await getReplyNotifications("me")).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("latestReplyActivityAt", () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    fake = fakeSupabase();
    vi.mocked(createClient).mockResolvedValue(fake.client as never);
  });

  const at = (hour: number) => `2026-10-29T${String(hour).padStart(2, "0")}:00:00Z`;
  const reads = () => fake.calls.filter((call) => call.method === "from");

  it("is the newest of a reply to you, a mention and a follow-up, read narrowly", async () => {
    const yours = {
      rating_id: 8,
      artist_rating_id: null,
      versus_take_id: null,
      thread_owner_id: "sam",
      created_at: at(5),
    };
    fake.answer(
      "replies",
      { data: [{ created_at: at(9) }], error: null },
      { data: [yours], error: null },
      { data: [{ created_at: at(11) }], error: null },
    );
    fake.answer("reply_mentions", { data: [{ replies: { created_at: at(10) } }], error: null });

    expect(await latestReplyActivityAt("me")).toBe(at(11));
    expect(reads()).toHaveLength(4);
    const selects = fake.calls.filter((call) => call.method === "select").map((c) => c.args[0]);
    expect(selects).toEqual([
      "created_at",
      "replies!inner ( created_at )",
      "rating_id, artist_rating_id, versus_take_id, thread_owner_id, created_at",
      "created_at",
    ]);
    const limits = fake.calls.filter((call) => call.method === "limit").map((c) => c.args[0]);
    expect(limits).toEqual([1, 1, 200, 1]);
  });

  it("is null when nothing's happened, without reading follow-ups", async () => {
    expect(await latestReplyActivityAt("me")).toBeNull();
    expect(reads()).toHaveLength(3);
  });

  it("logs a failed read and still answers from the others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.answer("replies", { data: null, error: { code: "57014", message: "timeout" } });
    fake.answer("reply_mentions", { data: [{ replies: { created_at: at(10) } }], error: null });
    expect(await latestReplyActivityAt("me")).toBe(at(10));
    expect(console.error).toHaveBeenCalled();
  });
});
