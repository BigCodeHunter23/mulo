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
import { getReplyCounts } from "@/lib/replies";

beforeEach(() => {
  db.fake = fakeSupabase();
  db.user = { id: "me", email: null };
  db.hidden = new Set();
});

describe("getReplyCounts", () => {
  it("counts each review's replies in one read", async () => {
    db.fake.answer("replies", {
      data: [
        { id: 1, rating_id: 7 },
        { id: 2, rating_id: 7 },
        { id: 3, rating_id: 9 },
      ],
      error: null,
    });
    expect(await getReplyCounts("album", [7, 8, 9])).toEqual({ 7: 2, 8: 0, 9: 1 });
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "in",
      args: ["rating_id", [7, 8, 9]],
    });
  });

  it("reads a long list a hundred at a time", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    await getReplyCounts("take", ids);
    const lists = db.fake
      .callsOn("replies")
      .filter((call) => call.method === "in")
      .map((call) => (call.args[1] as number[]).length);
    expect(lists).toEqual([100, 50]);
  });

  it("counts nothing, without asking, signed out or for no ids", async () => {
    db.user = null;
    expect(await getReplyCounts("artist", [4])).toEqual({ 4: 0 });
    db.user = { id: "me", email: null };
    expect(await getReplyCounts("artist", [])).toEqual({});
    expect(db.fake.calls).toEqual([]);
  });

  it("counts 0 before migration 0024 runs", async () => {
    db.fake.answer("replies", { data: null, error: { code: "PGRST205", message: "no table" } });
    expect(await getReplyCounts("album", [7])).toEqual({ 7: 0 });
  });
});
