import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A block hides both ways, so somebody blocked drops out of lists, the
 * notifications and the love and nah counts, on the website and in the app.
 * The database is a stand-in answering each table with its rows.
 */

const ME = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const OTHER = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
const HIDDEN = "a3d0a1c4-0000-4000-8000-000000000001";

const tables = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));

/** A query that answers its table's rows, whatever it's asked along the way. */
function query(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "order", "limit", "range"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: tables.rows[table] ?? [], error: null });
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: query })),
  getCurrentUser: vi.fn(async () => ({ id: ME, email: null })),
}));
vi.mock("@/lib/blocks", () => ({ hiddenPeople: vi.fn(async () => new Set([HIDDEN])) }));
// The bell's reply lines are worked out in their own module; here, one from a hidden person.
vi.mock("@/lib/reply-notifications", () => ({
  getReplyNotifications: vi.fn(async () => [
    {
      kind: "reply",
      key: "reply-album-7",
      at: "2026-10-09T00:00:00Z",
      person: { id: HIDDEN, username: "hidden", display_name: null, avatar_url: null },
      others: 0,
      on: "review",
      subject: { title: "Blonde", href: "/album/m1/reviews/7" },
    },
  ]),
}));
vi.mock("@/lib/social", () => ({ getFollowingIds: vi.fn(async () => []) }));
vi.mock("@/lib/versus", () => ({
  getLatestVersusAt: vi.fn(async () => null),
  getRecentResults: vi.fn(async () => []),
  getTodaysMatchup: vi.fn(async () => null),
  hasPickedToday: vi.fn(async () => true),
  MATCHUP_SELECT: "",
  sydneyMidnight: vi.fn(),
  toMatchup: vi.fn(),
}));

const { getListsWithAlbum, getRecentLists } = await import("@/lib/lists");
const { getReactions } = await import("@/lib/reactions");
const { getLatestNotificationAt, getNotifications } = await import("@/lib/notifications");

function listRow(id: number, owner: string) {
  return {
    id,
    user_id: owner,
    title: `List ${id}`,
    description: null,
    ranked: false,
    updated_at: "2026-10-01T00:00:00Z",
    profiles: { username: `u${id}`, display_name: null, avatar_url: null },
    list_items: [{ position: 1, releases: { cover_art_url: null } }],
  };
}

function person(id: string) {
  return { id, username: `u${id.slice(0, 4)}`, display_name: null, avatar_url: null };
}

beforeEach(() => {
  tables.rows = {};
});

describe("lists", () => {
  it("leaves hidden people's lists out of recent lists", async () => {
    tables.rows.lists = [listRow(1, ME), listRow(2, HIDDEN), listRow(3, OTHER)];
    expect((await getRecentLists(24)).map((list) => list.id)).toEqual([1, 3]);
  });

  it("leaves them out of the lists an album is on", async () => {
    tables.rows.list_items = [{ list_id: 1 }, { list_id: 2 }];
    tables.rows.lists = [listRow(1, OTHER), listRow(2, HIDDEN)];
    expect((await getListsWithAlbum("mbid")).map((list) => list.id)).toEqual([1]);
  });

  it("says whose each list is", async () => {
    tables.rows.lists = [listRow(3, OTHER)];
    expect((await getRecentLists(24))[0]?.ownerId).toBe(OTHER);
  });
});

describe("reactions", () => {
  it("doesn't count a hidden person's love or nah", async () => {
    tables.rows.reactions = [
      { user_id: OTHER, value: 1, rating_id: 7 },
      { user_id: HIDDEN, value: -1, rating_id: 7 },
      { user_id: ME, value: 1, rating_id: 7 },
    ];
    expect((await getReactions("album", [7]))[7]).toEqual({ love: 2, dislike: 0, mine: 1 });
  });
});

describe("notifications", () => {
  it("drops anything from a hidden person", async () => {
    tables.rows.follows = [
      { follower_id: HIDDEN, created_at: "2026-10-02T00:00:00Z" },
      { follower_id: OTHER, created_at: "2026-10-01T00:00:00Z" },
    ];
    tables.rows.profiles = [person(HIDDEN), person(OTHER)];
    const found = await getNotifications(ME);
    expect(found.map((n) => (n.kind === "follow" ? n.person.id : n.kind))).toEqual([OTHER]);
  });

  it("doesn't light the bell for a hidden person", async () => {
    tables.rows.follows = [
      { follower_id: HIDDEN, created_at: "2026-10-02T00:00:00Z" },
      { follower_id: OTHER, created_at: "2026-10-01T00:00:00Z" },
    ];
    tables.rows.reactions = [{ user_id: HIDDEN, created_at: "2026-10-03T00:00:00Z" }];
    expect(await getLatestNotificationAt(ME)).toBe("2026-10-01T00:00:00Z");
  });
});
