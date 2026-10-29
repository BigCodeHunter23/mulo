import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.fake.client }));
vi.mock("@/lib/blocks", () => ({ hiddenFilter: async () => null }));
vi.mock("@/lib/replies", () => ({ getReplyCounts: vi.fn(async () => ({ 7: 3 })) }));

import { fakeSupabase } from "../../test/fake-supabase";
import { getReplyCounts } from "@/lib/replies";
import { getReviews } from "@/lib/reviews";

const SAM = { id: "s", username: "sam", display_name: "Sam", avatar_url: null };
const row = (id: number) => ({
  id,
  score: 9,
  review: "Good.",
  created_at: "2026-10-29T00:00:00Z",
  profiles: SAM,
});

beforeEach(() => {
  db.fake = fakeSupabase();
});

describe("getReviews", () => {
  it("carries each review's reply count", async () => {
    db.fake.answer("ratings", { data: [row(7), row(8)], error: null });
    const reviews = await getReviews("album", "0383dadf-2a4e-4d10-a46a-e9e041da8eb3");
    expect(reviews.map((review) => [review.id, review.replies])).toEqual([
      [7, 3],
      [8, 0],
    ]);
    expect(getReplyCounts).toHaveBeenCalledWith("album", [7, 8]);
  });
});
