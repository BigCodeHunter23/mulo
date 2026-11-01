import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  /** The visitor's own client. */
  fake: null as unknown as FakeSupabase,
  /** The service role's, which alone writes takes (migration 0027). */
  admin: null as unknown as FakeSupabase,
  /** The side the visitor picked in the matchup, if any. */
  pick: "left" as "left" | "right" | null,
  /** Whether reading the visitor's pick fails. */
  pickFails: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => ({ id: ME, email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/versus", () => ({
  getPick: vi.fn(async () => db.pick),
  hasPicked: vi.fn(async () => (db.pickFails ? null : db.pick !== null)),
  getTally: vi.fn(async () => undefined),
}));
vi.mock("@/lib/rate-limit", () => ({ allowUser: vi.fn(async () => true), TOO_MANY: "Slow down." }));
vi.mock("@/lib/content-filter", () => ({
  isRespectful: (text: string) => !text.includes("HATEFUL"),
  NOT_RESPECTFUL: "Please keep it respectful.",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { hasPicked } from "@/lib/versus";
import { postTake } from "./actions";

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
  db.pick = "left";
  db.pickFails = false;
});

describe("postTake", () => {
  it("writes the take with the service role, as the signed-in person", async () => {
    expect(await postTake(12, "  Illmatic alone.  ")).toEqual({ ok: true });
    expect(hasPicked).toHaveBeenCalledWith(12, ME);
    const insert = db.admin.callsOn("versus_takes").find((call) => call.method === "insert");
    expect(insert?.args[0]).toEqual({ matchup_id: 12, user_id: ME, body: "Illmatic alone." });
    expect(db.fake.callsOn("versus_takes")).toEqual([]);
  });

  it("asks for a pick first and writes nothing, as the database used to", async () => {
    db.pick = null;
    expect(await postTake(12, "Fair.")).toEqual({
      ok: false,
      error: "Pick a side first, then make your case.",
    });
    expect(db.admin.calls).toEqual([]);
  });

  it("asks to try again, not to pick, when the pick can't be read", async () => {
    db.pickFails = true;
    expect(await postTake(12, "Fair.")).toEqual({
      ok: false,
      error: "Couldn't save that. Please try again.",
    });
    expect(db.admin.calls).toEqual([]);
  });

  it("says so when they've had their say already", async () => {
    db.admin.answer("versus_takes", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    expect(await postTake(12, "Again.")).toEqual({
      ok: false,
      error: "You've already had your say on this one.",
    });
  });

  it("refuses disrespectful words before anything else", async () => {
    expect(await postTake(12, "HATEFUL")).toEqual({
      ok: false,
      error: "Please keep it respectful.",
    });
    expect(hasPicked).not.toHaveBeenCalled();
    expect(db.admin.calls).toEqual([]);
  });
});
