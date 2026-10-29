import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

const db = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  user: null as { id: string; email: string | null } | null,
  hidden: new Set<string>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => db.user,
}));
vi.mock("@/lib/blocks", () => ({ hiddenPeople: async () => db.hidden }));
vi.mock("@/lib/reactions", () => ({
  NO_REACTIONS: { love: 0, dislike: 0, mine: null },
  getReactions: vi.fn(async (_kind: string, ids: number[]) =>
    Object.fromEntries(ids.map((id) => [id, { love: 2, dislike: 0, mine: null }])),
  ),
}));
vi.mock("@/lib/versus", () => ({
  MATCHUP_SELECT: "id, day",
  sydneyDay: () => "2026-10-29",
  getPick: vi.fn(async () => null),
  toMatchup: (row: { id: number; day: string }) => ({
    id: row.id,
    day: row.day,
    title: "Under Pressure",
    tagline: "",
    left: { mbid: "l", name: "Nas", image: null },
    right: { mbid: "r", name: "Jay-Z", image: null },
  }),
}));
vi.mock("@/lib/supabase/errors", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/errors")>()),
  logQueryError: vi.fn(),
}));

import { fakeSupabase } from "../../test/fake-supabase";
import { getReplyCounts, getThread, mentionedIn, replyable } from "@/lib/replies";
import { getPick } from "@/lib/versus";
import { logQueryError } from "@/lib/supabase/errors";

beforeEach(() => {
  vi.mocked(logQueryError).mockClear();
  db.fake = fakeSupabase();
  db.user = { id: "me", email: null };
  db.hidden = new Set();
});

describe("getReplyCounts", () => {
  const COUNTS = "rpc:reply_counts";

  it("asks the database to count each review's replies, in one call", async () => {
    db.fake.answer(COUNTS, {
      data: [
        { id: 7, replies: 2 },
        { id: 9, replies: 1 },
      ],
      error: null,
    });
    expect(await getReplyCounts("album", [7, 8, 9])).toEqual({ 7: 2, 8: 0, 9: 1 });
    expect(db.fake.calls).toEqual([
      {
        table: COUNTS,
        method: "rpc",
        args: ["reply_counts", { p_kind: "album", p_ids: [7, 8, 9] }],
      },
    ]);
  });

  it("asks about a long list a hundred at a time", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    db.fake.answer(
      COUNTS,
      { data: [{ id: 1, replies: 3 }], error: null },
      { data: [{ id: 150, replies: 4 }], error: null },
    );
    const counts = await getReplyCounts("take", ids);
    expect([counts[1], counts[2], counts[150]]).toEqual([3, 0, 4]);
    const lists = db.fake
      .callsOn(COUNTS)
      .map((call) => (call.args[1] as { p_ids: number[] }).p_ids.length);
    expect(lists).toEqual([100, 50]);
  });

  it("counts nothing, without asking, signed out or for no ids", async () => {
    db.user = null;
    expect(await getReplyCounts("artist", [4])).toEqual({ 4: 0 });
    db.user = { id: "me", email: null };
    expect(await getReplyCounts("artist", [])).toEqual({});
    expect(db.fake.calls).toEqual([]);
  });

  it("counts 0, quietly, before migration 0024 runs", async () => {
    db.fake.answer(
      COUNTS,
      { data: null, error: { code: "PGRST202", message: "no function" } },
      { data: null, error: { code: "PGRST205", message: "no table" } },
    );
    expect(await getReplyCounts("album", [7])).toEqual({ 7: 0 });
    expect(await getReplyCounts("album", [7])).toEqual({ 7: 0 });
    expect(logQueryError).not.toHaveBeenCalled();
  });

  it("counts 0 and says why when the database fails", async () => {
    db.fake.answer(COUNTS, { data: null, error: { code: "57014", message: "timeout" } });
    expect(await getReplyCounts("album", [7])).toEqual({ 7: 0 });
    expect(logQueryError).toHaveBeenCalled();
  });
});

const SAM = { id: "owner", username: "sam", display_name: "Sam", avatar_url: null };
const JO = { id: "jo", username: "joe", display_name: "Jo", avatar_url: null };

const albumRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  user_id: "owner",
  score: 9,
  review: "Front to back.",
  created_at: "2026-10-28T10:00:00Z",
  profiles: SAM,
  releases: {
    mbid: "m1",
    title: "Blonde",
    cover_art_url: null,
    artists: { mbid: "a1", name: "Frank Ocean" },
  },
  ...over,
});

const replyRow = (id: number, by = JO, body = "Agreed.") => ({
  id,
  body,
  created_at: `2026-10-29T0${id}:00:00Z`,
  user_id: by.id,
  profiles: by,
});

const takeRow = {
  id: 9,
  body: "Nas, easily.",
  created_at: "2026-10-29T01:00:00Z",
  user_id: "owner",
  profiles: SAM,
  versus_matchups: { id: 3, day: "2026-10-29" },
};

const open = async (kind: "album" | "artist" | "take", id: number) => {
  const page = await getThread(kind, id);
  if (page.state !== "open") throw new Error(`expected an open thread, got ${page.state}`);
  return page;
};

describe("getThread", () => {
  it("answers the review, its replies oldest first, and what the owner may do", async () => {
    db.user = { id: "owner", email: null };
    db.fake.answer("ratings", { data: albumRow(), error: null });
    db.fake.answer("replies", {
      data: [replyRow(1), replyRow(2, SAM, "@Joe thanks")],
      error: null,
    });
    db.fake.answer("profiles", { data: [{ id: "jo", username: "Joe" }], error: null });

    const page = await open("album", 7);
    expect(page).toMatchObject({
      canReply: true,
      available: true,
      head: {
        kind: "album",
        ratingId: 7,
        review: "Front to back.",
        reaction: { love: 2 },
        release: { mbid: "m1", title: "Blonde", artist: { name: "Frank Ocean" } },
      },
    });
    // Jo's reply can be deleted by Sam, whose review it's on; Sam's own names Jo.
    expect(page.replies.map((r) => [r.id, r.mine, r.canDelete, r.mentions])).toEqual([
      [1, false, true, []],
      [2, true, true, ["Joe"]],
    ]);
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "eq",
      args: ["rating_id", 7],
    });
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "order",
      args: ["created_at", { ascending: true }],
    });
  });

  it("lets somebody else delete only their own replies", async () => {
    db.user = { id: "jo", email: null };
    db.fake.answer("ratings", { data: albumRow(), error: null });
    db.fake.answer("replies", { data: [replyRow(1), replyRow(2, SAM)], error: null });
    const page = await open("album", 7);
    expect(page.replies.map((r) => r.canDelete)).toEqual([true, false]);
  });

  it("says a review is gone when it's deleted, cleared, or its writer is hidden from you", async () => {
    db.fake.answer(
      "ratings",
      { data: null, error: null },
      { data: albumRow({ review: "   " }), error: null },
      { data: albumRow(), error: null },
    );
    expect(await getThread("album", 7)).toEqual({ state: "gone" });
    expect(await getThread("album", 7)).toEqual({ state: "gone" });
    db.hidden = new Set(["owner"]);
    expect(await getThread("album", 7)).toEqual({ state: "gone" });
  });

  it("leaves out replies by people hidden from you, and their @names", async () => {
    db.hidden = new Set(["jo"]);
    db.fake.answer("ratings", { data: albumRow(), error: null });
    db.fake.answer("replies", {
      data: [replyRow(1), replyRow(2, SAM, "@joe was wrong")],
      error: null,
    });
    db.fake.answer("profiles", { data: [{ id: "jo", username: "joe" }], error: null });
    const page = await open("album", 7);
    expect(page.replies.map((r) => [r.id, r.mentions])).toEqual([[2, []]]);
  });

  it("reads no replies signed out, and offers no reply box", async () => {
    db.user = null;
    db.fake.answer("ratings", { data: albumRow(), error: null });
    expect(await open("album", 7)).toMatchObject({ replies: [], canReply: false });
    expect(db.fake.callsOn("replies")).toEqual([]);
  });

  it("has no replies, and takes none, before migration 0024", async () => {
    db.fake.answer("ratings", { data: albumRow(), error: null });
    db.fake.answer("replies", { data: null, error: { code: "PGRST205", message: "no table" } });
    expect(await open("album", 7)).toMatchObject({
      replies: [],
      available: false,
      canReply: false,
    });
  });

  it("reads an artist review", async () => {
    db.fake.answer("artist_ratings", {
      data: {
        id: 8,
        user_id: "owner",
        score: 8,
        review: "Consistent.",
        created_at: "2026-10-28T10:00:00Z",
        profiles: SAM,
        artists: { mbid: "a1", name: "Frank Ocean", image_url: null },
      },
      error: null,
    });
    db.fake.answer("replies", { data: [], error: null });
    expect(await open("artist", 8)).toMatchObject({
      head: { kind: "artist", ratingId: 8, artist: { name: "Frank Ocean" } },
    });
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "eq",
      args: ["artist_rating_id", 8],
    });
  });

  it("keeps a take on today's Versus locked until you've picked", async () => {
    db.fake.answer("versus_takes", { data: takeRow, error: null }, { data: takeRow, error: null });
    db.fake.answer("replies", { data: [replyRow(1)], error: null });
    // Your pick, then the take's author's.
    vi.mocked(getPick).mockResolvedValueOnce(null).mockResolvedValueOnce("left");
    expect(await getThread("take", 9)).toEqual({ state: "locked", day: "2026-10-29" });

    vi.mocked(getPick).mockResolvedValueOnce("right").mockResolvedValueOnce("left");
    expect(await open("take", 9)).toMatchObject({
      head: {
        kind: "take",
        take: { id: 9, side: "left", replies: 1, reactions: { love: 2 }, mine: false },
        matchup: { id: 3, day: "2026-10-29", title: "Under Pressure" },
      },
    });
  });

  it("reads a locked take by someone hidden from you as gone", async () => {
    db.hidden = new Set(["owner"]);
    db.fake.answer("versus_takes", { data: takeRow, error: null }, { data: takeRow, error: null });
    vi.mocked(getPick).mockResolvedValueOnce(null).mockResolvedValueOnce("left");
    expect(await getThread("take", 9)).toEqual({ state: "gone" });
    vi.mocked(getPick).mockResolvedValueOnce(null).mockResolvedValueOnce("left");
    expect(await replyable("take", 9)).toBe("gone");
  });

  it("never locks a take from its own author", async () => {
    db.user = { id: "owner", email: null };
    db.fake.answer("versus_takes", { data: takeRow, error: null });
    db.fake.answer("replies", { data: [], error: null });
    vi.mocked(getPick).mockResolvedValueOnce("left");
    expect(await open("take", 9)).toMatchObject({ head: { take: { mine: true } } });
  });
});

describe("replyable", () => {
  it("is open for a written review, gone for none or a hidden writer", async () => {
    db.fake.answer(
      "ratings",
      { data: albumRow(), error: null },
      { data: null, error: null },
      { data: albumRow(), error: null },
    );
    expect(await replyable("album", 7)).toBe("open");
    expect(await replyable("album", 7)).toBe("gone");
    db.hidden = new Set(["owner"]);
    expect(await replyable("album", 7)).toBe("gone");
  });

  it("is locked for a take on today's Versus before you've picked", async () => {
    db.fake.answer("versus_takes", { data: takeRow, error: null });
    vi.mocked(getPick).mockResolvedValueOnce(null).mockResolvedValueOnce("left");
    expect(await replyable("take", 9)).toBe("locked");
  });
});

describe("mentionedIn", () => {
  it("answers the real people a reply names, by their own usernames", async () => {
    db.fake.answer("profiles", {
      data: [
        { id: "s", username: "Sam" },
        { id: "k", username: "kim" },
      ],
      error: null,
    });
    expect(await mentionedIn("@sam and @nobody")).toEqual(["Sam"]);
    expect(db.fake.callsOn("profiles")).toContainEqual({
      table: "profiles",
      method: "or",
      args: ["username.ilike.sam,username.ilike.nobody"],
    });
  });

  it("asks nothing when nobody is named", async () => {
    expect(await mentionedIn("no names here")).toEqual([]);
    expect(db.fake.calls).toEqual([]);
  });
});
