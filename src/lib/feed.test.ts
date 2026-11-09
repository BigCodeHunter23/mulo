import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

const db = vi.hoisted(() => ({
  /** The viewer's own client: row-level security decides what it reads. */
  session: null as unknown as FakeSupabase,
  /** The service role, which reads what the website then decides on. */
  admin: null as unknown as FakeSupabase,
  hidden: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.session.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/social", () => ({ getFollowingIds: async () => ["friend"] }));
vi.mock("@/lib/blocks", () => ({ hiddenFilter: async () => db.hidden }));
vi.mock("@/lib/replies", () => ({ getReplyCounts: async () => ({}) }));
vi.mock("@/lib/reactions", () => ({
  NO_REACTIONS: { love: 0, dislike: 0, mine: null },
  getReactions: async () => ({}),
}));
vi.mock("@/lib/versus", () => ({
  MATCHUP_SELECT: "id, day",
  sydneyDay: () => "2026-11-09",
  toMatchup: (row: { id: number; day: string }) => ({
    id: row.id,
    day: row.day,
    title: "Under Pressure",
    tagline: "",
    left: { mbid: "l", name: "Nas", image: null },
    right: { mbid: "r", name: "Jay-Z", image: null },
  }),
}));

import { fakeSupabase } from "../../test/fake-supabase";
import { getFollowingFeed } from "@/lib/feed";

const pickRow = (day: string) => ({
  id: 5,
  pick: "left",
  created_at: "2026-11-09T01:00:00Z",
  profiles: { id: "friend", username: "friend", display_name: null, avatar_url: null },
  versus_matchups: { id: 1, day },
});

beforeEach(() => {
  db.session = fakeSupabase();
  db.admin = fakeSupabase();
  db.hidden = null;
});

describe("a friend's Versus pick in the feed", () => {
  it("doesn't say which side, until the viewer has picked too", async () => {
    db.admin.answer("versus_votes", { data: [pickRow("2026-11-09")], error: null });
    db.session.answer("versus_votes", { data: [], error: null });

    const [item] = await getFollowingFeed("me");

    expect(item).toMatchObject({ kind: "pick", revealed: false, pick: null });
  });

  it("says which side once the viewer has picked", async () => {
    db.admin.answer("versus_votes", { data: [pickRow("2026-11-09")], error: null });
    db.session.answer("versus_votes", { data: [{ matchup_id: 1 }], error: null });

    const [item] = await getFollowingFeed("me");

    expect(item).toMatchObject({ kind: "pick", revealed: true, pick: "left" });
  });

  it("says which side once the matchup is over, picked or not", async () => {
    db.admin.answer("versus_votes", { data: [pickRow("2026-11-08")], error: null });
    db.session.answer("versus_votes", { data: [], error: null });

    const [item] = await getFollowingFeed("me");

    expect(item).toMatchObject({ kind: "pick", revealed: true, pick: "left" });
  });

  it("keeps out anybody blocked, either way round", async () => {
    db.hidden = "(blocked)";
    db.admin.answer("versus_votes", { data: [], error: null });
    db.session.answer("versus_votes", { data: [], error: null });

    await getFollowingFeed("me");

    expect(db.admin.callsOn("versus_votes")).toContainEqual({
      table: "versus_votes",
      method: "not",
      args: ["user_id", "in", "(blocked)"],
    });
  });
});
