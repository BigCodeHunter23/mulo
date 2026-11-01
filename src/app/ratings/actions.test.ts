import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const NAS = "cfbc0924-0035-4d6c-8197-f024653af823";

const db = vi.hoisted(() => ({
  /** The visitor's own client: scores. */
  fake: null as unknown as FakeSupabase,
  /** The service role's, which alone writes reviews (migration 0027). */
  admin: null as unknown as FakeSupabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => ({ id: ME, email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/rate-limit", () => ({ allowUser: vi.fn(async () => true), TOO_MANY: "Slow down." }));
vi.mock("@/lib/content-filter", () => ({
  isRespectful: (text: string) => !text.includes("HATEFUL"),
  NOT_RESPECTFUL: "Please keep it respectful.",
}));
vi.mock("@/lib/badges", () => ({ getBadges: vi.fn(async () => []) }));
vi.mock("@/lib/ratings", () => ({ getCrowd: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { rate, saveReview } from "./actions";

/** The writes made on one table through one client. */
function writes(client: FakeSupabase, table: string) {
  return client
    .callsOn(table)
    .filter((call) => ["insert", "update", "upsert"].includes(call.method));
}

/** One table's calls through one client, as [method, ...args]. */
function chain(client: FakeSupabase, table: string) {
  return client.callsOn(table).map(({ method, args }) => [method, ...args]);
}

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
});

describe("saveReview", () => {
  it("writes the review with the service role, on the signed-in person's own rating", async () => {
    db.admin.answer("ratings", { data: [{ id: 7 }], error: null });
    expect(await saveReview("album", ILLMATIC, "  Still the one.  ")).toEqual({ ok: true });
    expect(chain(db.admin, "ratings")).toEqual([
      ["from", "ratings"],
      ["update", { review: "Still the one." }],
      ["eq", "user_id", ME],
      ["eq", "release_mbid", ILLMATIC],
      ["select", "id"],
    ]);
    expect(writes(db.fake, "ratings")).toEqual([]);
  });

  it("writes an artist review to artist_ratings the same way", async () => {
    db.admin.answer("artist_ratings", { data: [{ id: 3 }], error: null });
    expect(await saveReview("artist", NAS, "Top five.")).toEqual({ ok: true });
    expect(chain(db.admin, "artist_ratings")).toEqual([
      ["from", "artist_ratings"],
      ["update", { review: "Top five." }],
      ["eq", "user_id", ME],
      ["eq", "artist_mbid", NAS],
      ["select", "id"],
    ]);
  });

  it("clears a review sent empty", async () => {
    db.admin.answer("ratings", { data: [{ id: 7 }], error: null });
    await saveReview("album", ILLMATIC, "   ");
    expect(writes(db.admin, "ratings")[0]?.args[0]).toEqual({ review: null });
  });

  it("asks for a score first when there's no rating to hang it on", async () => {
    db.admin.answer("ratings", { data: [], error: null });
    expect(await saveReview("album", ILLMATIC, "Words.")).toEqual({
      ok: false,
      error: "Pick a score first, then add your review.",
    });
  });

  it("refuses disrespectful words and writes nothing", async () => {
    expect(await saveReview("album", ILLMATIC, "HATEFUL")).toEqual({
      ok: false,
      error: "Please keep it respectful.",
    });
    expect(db.admin.calls).toEqual([]);
    expect(db.fake.calls).toEqual([]);
  });
});

describe("rate", () => {
  it("still saves a score through the person's own session, with no words", async () => {
    expect((await rate("album", ILLMATIC, 8)).ok).toBe(true);
    expect(writes(db.fake, "ratings")[0]?.args[0]).toEqual({
      user_id: ME,
      release_mbid: ILLMATIC,
      score: 8,
    });
    expect(db.admin.calls).toEqual([]);
  });
});
