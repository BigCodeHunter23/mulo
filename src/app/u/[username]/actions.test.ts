import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  /** Every row inserted, by table. */
  inserted: [] as { table: string; row: Record<string, unknown> }[],
  /** What inserting into each table answers. */
  answer: {} as Record<string, { code: string; message: string } | null>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/rate-limit", () => ({ allowUser: async () => true, TOO_MANY: "Too many." }));
vi.mock("@/lib/supabase/errors", () => ({ logQueryError: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: ME }),
  createClient: async () => ({
    from: (table: string) => {
      const builder = {
        insert: async (row: Record<string, unknown>) => {
          db.inserted.push({ table, row });
          return { error: db.answer[table] ?? null };
        },
        delete: () => builder,
        eq: () => builder,
        or: async () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
      };
      return builder;
    },
  }),
}));

import { setBlocked } from "./actions";

const reports = () => db.inserted.filter((insert) => insert.table === "reports");

beforeEach(() => {
  db.inserted = [];
  db.answer = {};
});

describe("setBlocked", () => {
  it("tells MULO about somebody blocked, as a report on their profile", async () => {
    expect(await setBlocked(THEM, "sam", true)).toEqual({ ok: true });
    expect(reports()).toEqual([
      {
        table: "reports",
        row: expect.objectContaining({
          reporter_id: ME,
          reported_profile_id: THEM,
          reason: "Something else",
          detail: expect.stringMatching(/blocked/i),
        }),
      },
    ]);
  });

  it("blocks all the same when they were reported already", async () => {
    db.answer.reports = { code: "23505", message: "duplicate key" };
    expect(await setBlocked(THEM, "sam", true)).toEqual({ ok: true });
  });

  it("blocks all the same when the report can't be filed", async () => {
    db.answer.reports = { code: "XX000", message: "down" };
    expect(await setBlocked(THEM, "sam", true)).toEqual({ ok: true });
  });

  it("files nothing for a block that was there already, or for unblocking", async () => {
    db.answer.blocks = { code: "23505", message: "duplicate key" };
    await setBlocked(THEM, "sam", true);
    await setBlocked(THEM, "sam", false);
    expect(reports()).toEqual([]);
  });
});
