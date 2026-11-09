import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

/**
 * Pictures are the website's to set (migration 0028), so saving Raised On goes in
 * with the service role, always on the signed-in person's own profile.
 */

const db = vi.hoisted(() => ({
  session: null as unknown as FakeSupabase,
  admin: null as unknown as FakeSupabase,
}));

const ME = "00000000-0000-4000-8000-000000000001";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.session.client,
  getCurrentUser: async () => ({ id: ME, email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/rate-limit", () => ({ allowUser: async () => true, TOO_MANY: "Too many." }));
vi.mock("@/lib/catalog", () => ({
  getCachedRelease: async () => ({ mbid: ILLMATIC, release_date: "1994-04-19" }),
}));

import { fakeSupabase } from "../../../test/fake-supabase";
import { saveRaisedOn } from "./actions";

const save = (useAsPicture: boolean) =>
  saveRaisedOn({ mbid: ILLMATIC, era: null, scene: null, useAsPicture });

beforeEach(() => {
  db.session = fakeSupabase();
  db.admin = fakeSupabase();
  db.session.answer("profiles", { data: { avatar_url: null }, error: null });
});

describe("saveRaisedOn", () => {
  it("sets the record as the picture with the service role, on your own profile", async () => {
    expect(await save(true)).toEqual({ ok: true });

    const calls = db.admin.callsOn("profiles");
    expect(calls).toContainEqual({ table: "profiles", method: "eq", args: ["id", ME] });
    expect(calls.find((call) => call.method === "update")?.args[0]).toMatchObject({
      raised_on_mbid: ILLMATIC,
      avatar_url: `/records/${ILLMATIC}`,
    });
  });

  it("leaves a real photo alone unless asked", async () => {
    db.session = fakeSupabase();
    db.session.answer("profiles", {
      data: { avatar_url: "https://x.supabase.co/storage/v1/object/public/avatars/a/avatar.jpg" },
      error: null,
    });

    expect(await save(false)).toEqual({ ok: true });

    const update = db.admin.callsOn("profiles").find((call) => call.method === "update");
    expect(update?.args[0]).not.toHaveProperty("avatar_url");
  });

  it("says so when it can't save", async () => {
    db.admin.answer("profiles", { data: null, error: { message: "no" } });
    expect(await save(true)).toEqual({
      ok: false,
      error: "Couldn't save that. Please try again.",
    });
  });
});
