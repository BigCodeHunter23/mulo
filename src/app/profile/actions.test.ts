import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  /** The visitor's own client. */
  fake: null as unknown as FakeSupabase,
  /** The service role's, which alone writes names and bios (migration 0027). */
  admin: null as unknown as FakeSupabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => ({ id: ME, email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
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

/** The profile row the save wrote with the service role, or undefined. */
function savedRow() {
  const upsert = db.admin.callsOn("profiles").find((call) => call.method === "upsert");
  return upsert?.args[0] as Record<string, unknown> | undefined;
}

/** The display name the save wrote, or undefined when nothing was written. */
function savedName() {
  return savedRow()?.display_name;
}

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
});

describe("saveProfile's write", () => {
  it("writes the words with the service role, as the signed-in person", async () => {
    const result = await saveProfile(
      {},
      form({ username: "alex", display_name: "Alex", bio: "Records." }),
    );
    expect(result.error).toBeUndefined();
    expect(savedRow()).toEqual({
      id: ME,
      username: "alex",
      display_name: "Alex",
      bio: "Records.",
    });
    expect(db.fake.callsOn("profiles")).toEqual([]);
  });

  it("takes the id from the session, never from the form", async () => {
    await saveProfile({}, form({ id: OTHER, username: "alex" }));
    expect(savedRow()?.id).toBe(ME);
  });

  it("leaves the bio alone when the form has none, as welcome's username pick does", async () => {
    await saveProfile({}, form({ username: "alex" }));
    expect(savedRow()).toEqual({ id: ME, username: "alex", display_name: null });
  });

  it("still says plainly when the username is taken", async () => {
    db.admin.answer("profiles", { data: null, error: { code: "23505", message: "duplicate" } });
    expect(await saveProfile({}, form({ username: "alex" }))).toEqual({
      error: "That username is already taken. Try another.",
    });
  });
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
