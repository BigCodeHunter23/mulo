import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hidden: null as string | null,
  takes: [] as {
    id: number;
    body: string;
    created_at: string;
    user_id: string;
    profiles: object;
  }[],
  /** Every filter put on the takes query, as [method, ...args]. */
  calls: [] as unknown[][],
}));

/** A PostgREST query that records its filters and answers with the rows it was given. */
function query(rows: () => unknown[], record: boolean) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "not", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      if (record) db.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve);
  return builder;
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: (table: string) =>
      table === "versus_takes" ? query(() => db.takes, true) : query(() => [], false),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "me" }) }));
vi.mock("@/lib/reactions", () => ({
  getReactions: async (_kind: string, ids: number[]) =>
    Object.fromEntries(ids.map((id) => [id, { love: 0, dislike: 0, mine: null }])),
}));
vi.mock("@/lib/blocks", () => ({ hiddenFilter: async () => db.hidden }));

import { getTakes } from "./versus-takes";

const take = (id: number, user_id: string) => ({
  id,
  body: `take ${id}`,
  created_at: "2026-10-28T09:00:00.000Z",
  user_id,
  profiles: { id: user_id, username: user_id, display_name: null, avatar_url: null },
});

beforeEach(() => {
  db.hidden = null;
  db.takes = [take(1, "sam")];
  db.calls = [];
});

describe("getTakes", () => {
  it("asks only for takes by people not blocked, either way round", async () => {
    db.hidden = "(blocked-1,blocked-2)";
    await getTakes(7);
    expect(db.calls).toContainEqual(["not", "user_id", "in", "(blocked-1,blocked-2)"]);
  });

  it("asks for everybody's when nobody is blocked", async () => {
    const { takes } = await getTakes(7);
    expect(db.calls.some(([method]) => method === "not")).toBe(false);
    expect(takes.map((t) => t.id)).toEqual([1]);
  });
});
