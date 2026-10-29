import { describe, expect, it, vi } from "vitest";

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

import { replyBell, toBellReply, type BellReply, type BellThread } from "@/lib/reply-notifications";

const me = { id: "me", username: "Me_1" };
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

  it("tells you you were named in somebody else's thread, whatever the case", () => {
    const out = replyBell(me, {
      ...none,
      mentions: [
        reply(5, "joe", 5, { body: "@me_1 look", thread: take }),
        reply(6, "joe", 6, { body: "@me_10 not you", thread: take }),
        // On your own review it's already a reply line.
        reply(7, "joe", 7, { body: "@Me_1 yours" }),
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
