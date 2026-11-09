import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

/**
 * Nobody but the people who've picked can read how today's Versus is going
 * (migration 0028), so the website reads it with the service role, then decides
 * itself what the viewer gets.
 */

const db = vi.hoisted(() => ({
  admin: null as unknown as FakeSupabase,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/social", () => ({ getFollowingIds: async () => ["friend"] }));

import { fakeSupabase } from "../../test/fake-supabase";
import { countPicks, getTally } from "@/lib/versus";

beforeEach(() => {
  db.admin = fakeSupabase();
});

describe("reading a matchup's picks", () => {
  it("counts each side with the service role", async () => {
    db.admin.answer("versus_votes", { count: 3, error: null }, { count: 2, error: null });
    expect(await countPicks(1)).toEqual({ left: 3, right: 2 });
  });

  it("reads friends' picks with the service role", async () => {
    const friend = { username: "friend", display_name: null, avatar_url: null };
    db.admin.answer(
      "versus_votes",
      { count: 1, error: null },
      { count: 0, error: null },
      { data: [{ matchup_id: 1, pick: "left", profiles: friend }], error: null },
    );
    expect(await getTally(1, "me")).toEqual({
      left: 1,
      right: 0,
      friends: { left: [friend], right: [] },
    });
  });
});
