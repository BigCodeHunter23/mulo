import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/rate-limit", () => ({ allowUser: async () => true, TOO_MANY: "Too many." }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null }),
  createClient: async () => db.fake.client,
}));

import { fakeSupabase } from "../../../test/fake-supabase";
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
  data.set("detail", "");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** The rows sent to `reports`. */
const inserted = () =>
  db.fake
    .callsOn("reports")
    .filter((call) => call.method === "insert")
    .map((call) => call.args[0]);

const THANKS = { message: "Thanks for the report. We'll take a look." };
const NOT_SENT = { error: "Couldn't send that report. Please try again." };

beforeEach(() => {
  db.fake = fakeSupabase();
});

describe("reporting a reply", () => {
  it("files it against the reply alone, with the reply's words", async () => {
    db.fake.answer("replies", { data: { body: "Buy followers at spam.example" }, error: null });
    expect(await submitReport({}, form({ reply_id: "41", reason: "Spam or advertising" }))).toEqual(
      THANKS,
    );
    expect(inserted()).toEqual([
      expect.objectContaining({
        reported_reply_id: 41,
        reported_rating_id: null,
        reported_profile_id: null,
        detail: "Reply: Buy followers at spam.example",
      }),
    ]);
  });

  it("reads the reply as the reporter, so the words are what they saw", async () => {
    db.fake.answer("replies", { data: { body: "Hi." }, error: null });
    await submitReport({}, form({ reply_id: "41", reason: "Spam or advertising" }));
    expect(db.fake.callsOn("replies")).toEqual(
      expect.arrayContaining([
        { table: "replies", method: "select", args: ["body"] },
        { table: "replies", method: "eq", args: ["id", 41] },
      ]),
    );
  });

  it("puts the reporter's own words first, then the reply's first 1,000 characters", async () => {
    db.fake.answer("replies", { data: { body: "x".repeat(1000) + "\u{1F600}" }, error: null });
    await submitReport(
      {},
      form({ reply_id: "41", reason: "Harassment or bullying", detail: "Third time today." }),
    );
    expect(inserted()).toEqual([
      expect.objectContaining({ detail: `Third time today.\n\nReply: ${"x".repeat(1000)}` }),
    ]);
  });

  it("files nothing about a reply the reporter can't see, or that's gone", async () => {
    db.fake.answer(
      "replies",
      { data: null, error: null },
      { data: null, error: { code: "PGRST205", message: "no table" } },
    );
    expect(await submitReport({}, form({ reply_id: "41", reason: "Spam or advertising" }))).toEqual(
      NOT_SENT,
    );
    expect(await submitReport({}, form({ reply_id: "41", reason: "Spam or advertising" }))).toEqual(
      NOT_SENT,
    );
    expect(inserted()).toEqual([]);
  });

  it("refuses a report about two things at once", async () => {
    expect(
      await submitReport(
        {},
        form({ reply_id: "41", rating_id: "7", reason: "Spam or advertising" }),
      ),
    ).toEqual(NOT_SENT);
    expect(inserted()).toEqual([]);
  });
});

describe("reporting anything else", () => {
  it("keeps only the reporter's own words, and reads no reply", async () => {
    expect(
      await submitReport(
        {},
        form({ rating_id: "7", reason: "Spam or advertising", detail: "Ad." }),
      ),
    ).toEqual(THANKS);
    expect(inserted()).toEqual([expect.objectContaining({ reported_rating_id: 7, detail: "Ad." })]);
    expect(db.fake.callsOn("replies")).toEqual([]);
  });
});
