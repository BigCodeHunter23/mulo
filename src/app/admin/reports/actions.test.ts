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
