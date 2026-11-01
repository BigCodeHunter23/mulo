import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.fake.client }));

import { fakeSupabase } from "../../test/fake-supabase";
import { hasPicked } from "./versus";

const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db.fake = fakeSupabase();
});

describe("hasPicked", () => {
  it("says yes when there's a pick", async () => {
    db.fake.answer("versus_votes", { data: { pick: "left" }, error: null });
    expect(await hasPicked(12, ME)).toBe(true);
  });

  it("says no when there's none", async () => {
    db.fake.answer("versus_votes", { data: null, error: null });
    expect(await hasPicked(12, ME)).toBe(false);
  });

  it("says it couldn't tell when the read fails", async () => {
    db.fake.answer("versus_votes", { data: null, error: { message: "down" } });
    expect(await hasPicked(12, ME)).toBeNull();
  });
});
