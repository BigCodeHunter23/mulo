import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.fake.client }));
vi.mock("@/lib/rate-limit", () => ({ allowUser: vi.fn(async () => true), TOO_MANY: "Slow down." }));
vi.mock("@/lib/social", () => ({ getEditableProfile: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { saveProfile } from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** The display name the save wrote, or undefined when nothing was written. */
function savedName() {
  const upsert = db.fake.callsOn("profiles").find((call) => call.method === "upsert");
  return (upsert?.args[0] as { display_name?: string | null } | undefined)?.display_name;
}

beforeEach(() => {
  db.fake = fakeSupabase();
});

describe("saveProfile's display name", () => {
  it("drops format characters, so a direction override can't spoof a name", async () => {
    const result = await saveProfile({}, form({ username: "alex", display_name: "Al\u202Eex" }));
    expect(result.error).toBeUndefined();
    expect(savedName()).toBe("Alex");
  });

  it("keeps the joiners emoji need, collapses spaces and trims", async () => {
    await saveProfile(
      {},
      form({ username: "alex", display_name: "  \u200BA\u00a0\n  \u{1F468}\u200D\u{1F469}  " }),
    );
    expect(savedName()).toBe("A \u{1F468}\u200D\u{1F469}");
  });

  it("saves a name of only format characters as no name", async () => {
    await saveProfile({}, form({ username: "alex", display_name: "\u202E\u200B \u2066" }));
    expect(savedName()).toBeNull();
  });

  it("measures the limit after cleaning", async () => {
    await saveProfile({}, form({ username: "alex", display_name: "x".repeat(50) + "\u200B" }));
    expect(savedName()).toBe("x".repeat(50));
    const long = await saveProfile({}, form({ username: "alex", display_name: "x".repeat(51) }));
    expect(long.error).toBe("Keep your name to 50 characters.");
  });
});
