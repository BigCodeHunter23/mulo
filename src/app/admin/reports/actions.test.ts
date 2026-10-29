import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  admin: null as { id: string; email: string | null } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ requireAdmin: vi.fn(async () => state.admin) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => state.fake.client) }));

import { revalidatePath } from "next/cache";
import { fakeSupabase } from "../../../../test/fake-supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeReply } from "./actions";

beforeEach(() => {
  state.fake = fakeSupabase();
  state.admin = { id: "admin-id", email: "admin@example.com" };
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(createAdminClient).mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("removeReply", () => {
  it("deletes the reply with the service role, and refreshes where it showed", async () => {
    await removeReply(41);
    expect(createAdminClient).toHaveBeenCalled();
    expect(state.fake.callsOn("replies")).toEqual([
      { table: "replies", method: "from", args: ["replies"] },
      { table: "replies", method: "delete", args: [] },
      { table: "replies", method: "eq", args: ["id", 41] },
    ]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/admin/reports"],
      ["/album", "layout"],
      ["/artist", "layout"],
      ["/versus", "layout"],
    ]);
  });

  it("closes the open reports about it once it's gone, which keep its words", async () => {
    // Its reports outlive it with no target (0024), so they're found first.
    state.fake.answer("reports", { data: [{ id: 5 }, { id: 6 }], error: null });
    await removeReply(41);
    expect(state.fake.callsOn("reports")).toEqual([
      { table: "reports", method: "from", args: ["reports"] },
      { table: "reports", method: "select", args: ["id"] },
      { table: "reports", method: "eq", args: ["reported_reply_id", 41] },
      { table: "reports", method: "eq", args: ["status", "open"] },
      { table: "reports", method: "from", args: ["reports"] },
      { table: "reports", method: "update", args: [{ status: "reviewed" }] },
      { table: "reports", method: "in", args: ["id", [5, 6]] },
    ]);
    const order = state.fake.calls.filter((call) => call.method === "from").map((c) => c.table);
    expect(order).toEqual(["reports", "replies", "reports"]);
  });

  it("leaves its reports open when the reply couldn't be deleted, or there are none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.fake.answer("reports", { data: [{ id: 5 }], error: null });
    state.fake.answer("replies", { data: null, error: { message: "down" } });
    await removeReply(41);
    await removeReply(42);
    expect(state.fake.callsOn("reports").filter((call) => call.method === "update")).toEqual([]);
  });

  it("does nothing for somebody who isn't an admin", async () => {
    state.admin = null;
    await removeReply(41);
    expect(state.fake.calls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does nothing for an id that isn't one", async () => {
    await removeReply(0);
    await removeReply(-1);
    expect(state.fake.calls).toEqual([]);
  });

  it("logs a failed delete", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    state.fake.answer("replies", { data: null, error: { message: "down" } });
    await removeReply(41);
    expect(logged).toHaveBeenCalledWith(
      "[admin] removed reply 41 failed for admin@example.com:",
      "down",
    );
  });
});
