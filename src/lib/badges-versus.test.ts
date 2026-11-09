import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

/**
 * Somebody's badges look the same to everyone, so their Versus counts can't depend
 * on whether the viewer may read today's matchup (migration 0028).
 */

const db = vi.hoisted(() => ({
  session: null as unknown as FakeSupabase,
  admin: null as unknown as FakeSupabase,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.session.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));

import { fakeSupabase } from "../../test/fake-supabase";
import { getBadges } from "@/lib/badges";

const THEM = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  db.session = fakeSupabase();
  db.admin = fakeSupabase();
});

describe("Versus counts on a badge board", () => {
  it.each(["versus_votes", "versus_takes"])("reads %s with the service role", async (table) => {
    await getBadges(THEM);

    expect(db.session.callsOn(table)).toEqual([]);
    expect(db.admin.callsOn(table)).toContainEqual({
      table,
      method: "eq",
      args: ["user_id", THEM],
    });
  });
});
