import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[] }));

vi.mock("@/lib/rate-limit", () => ({ allowUser: async () => true, TOO_MANY: "Too many." }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null }),
  createClient: async () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        db.inserted.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { submitReport } from "./actions";

/** The form sends every target field, empty except the one it's about. */
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const name of [
    "rating_id",
    "artist_rating_id",
    "profile_id",
    "versus_take_id",
    "list_id",
    "reply_id",
  ]) {
    data.set(name, "");
  }
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  db.inserted = [];
});

describe("reporting a reply", () => {
  it("files it against the reply alone", async () => {
    expect(await submitReport({}, form({ reply_id: "41", reason: "Spam or advertising" }))).toEqual(
      {
        message: "Thanks for the report. We'll take a look.",
      },
    );
    expect(db.inserted).toEqual([
      expect.objectContaining({
        reported_reply_id: 41,
        reported_rating_id: null,
        reported_profile_id: null,
      }),
    ]);
  });

  it("refuses a report about two things at once", async () => {
    expect(
      await submitReport(
        {},
        form({ reply_id: "41", rating_id: "7", reason: "Spam or advertising" }),
      ),
    ).toEqual({ error: "Couldn't send that report. Please try again." });
    expect(db.inserted).toEqual([]);
  });
});
