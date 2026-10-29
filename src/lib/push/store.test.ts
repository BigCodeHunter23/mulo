import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }),
}));

import { readTimeZone } from "@/lib/push/store";

describe("readTimeZone", () => {
  it("answers null, rather than throwing, when the database can't be reached", async () => {
    expect(await readTimeZone("u")).toBeNull();
  });
});
