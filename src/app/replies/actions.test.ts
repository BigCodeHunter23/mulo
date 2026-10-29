import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const KIM = "33333333-3333-4333-8333-333333333333";
const LEE = "44444444-4444-4444-8444-444444444444";

const db = vi.hoisted(() => ({
  /** The visitor's own client. */
  fake: null as unknown as FakeSupabase,
  /** The service role's, which alone writes replies. */
  admin: null as unknown as FakeSupabase,
  user: null as { id: string; email: string | null } | null,
  limited: false,
  state: "open" as "open" | "locked" | "gone",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => db.user,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/rate-limit", () => ({
  allowUser: vi.fn(async () => !db.limited),
  TOO_MANY: "You're doing that a lot. Please wait a minute and try again.",
}));
vi.mock("@/lib/content-filter", () => ({
  isRespectful: (text: string) => !text.includes("HATEFUL"),
  NOT_RESPECTFUL: "Please keep it respectful.",
}));
vi.mock("@/lib/replies", () => ({
  REPLY_COLUMNS: { album: "rating_id", artist: "artist_rating_id", take: "versus_take_id" },
  NOT_YET: "Replies aren't available yet.",
  PICK_FIRST: "Pick a side first, then join in.",
  replyable: vi.fn(async () => db.state),
  mentionedIn: vi.fn(async () => ["Kim"]),
}));
// Who a reply names is kept by the real rule, over a stand-in store.
vi.mock("@/lib/push/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push/events")>()),
  notifyReply: vi.fn(async () => {}),
}));
vi.mock("@/lib/push/send", () => ({}));
vi.mock("@/lib/push/store", () => ({
  personOf: vi.fn(),
  peoplePushesSince: vi.fn(),
  loveTarget: vi.fn(),
  replyTarget: vi.fn(async () => ({
    ownerId: OWNER,
    owner: { username: "sam", display_name: null },
    subject: { kind: "album", mbid: "m1", id: 7, title: "Blonde" },
    openMatchup: null,
  })),
  peopleNamed: vi.fn(async () => []),
  picksIn: vi.fn(async () => new Set()),
  // Everybody named follows the replier, or the replier them.
  followsEitherWay: vi.fn(async (_person: string, ids: string[]) => new Set(ids)),
  repliedIn: vi.fn(async () => new Set()),
  blockedEitherWay: vi.fn(async () => false),
  saveMentions: vi.fn(async () => {}),
}));
vi.mock("@/lib/push/later", () => ({ later: (task: () => Promise<unknown>) => void task() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { allowUser } from "@/lib/rate-limit";
import { notifyReply } from "@/lib/push/events";
import * as store from "@/lib/push/store";
import { replyable } from "@/lib/replies";
import { deleteReply, postReply } from "./actions";

const saved = {
  id: 41,
  body: "@kim fair.",
  created_at: "2026-10-29T08:00:00Z",
  profiles: { id: ME, username: "me", display_name: null, avatar_url: null },
};

/**
 * The server's answers to posting: how many replies you already have in the
 * thread, then each insert's answer.
 */
function answersPosting(...inserts: unknown[]) {
  for (const insert of inserts) db.admin.answer("replies", { count: 0, error: null }, insert);
}

const saves = () => answersPosting({ data: saved, error: null });

const inserted = () => db.admin.callsOn("replies").filter((call) => call.method === "insert");

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
  db.user = { id: ME, email: null };
  db.limited = false;
  db.state = "open";
  vi.mocked(store.blockedEitherWay).mockImplementation(async () => false);
});

describe("postReply", () => {
  it("saves the trimmed reply as you, then pushes", async () => {
    saves();
    const result = await postReply("album", 7, "  @kim fair.  ");
    expect(result).toEqual({
      ok: true,
      reply: {
        id: 41,
        body: "@kim fair.",
        createdAt: "2026-10-29T08:00:00Z",
        author: saved.profiles,
        mentions: ["Kim"],
        mine: true,
        canDelete: true,
      },
    });
    expect(inserted()).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "@kim fair.", rating_id: 7 }],
    });
    expect(allowUser).toHaveBeenCalledWith("post", ME);
    expect(notifyReply).toHaveBeenCalledWith({
      kind: "album",
      targetId: 7,
      replierId: ME,
      body: "@kim fair.",
    });
  });

  it("keeps who it names, of the people who may read the thread", async () => {
    vi.mocked(store.peopleNamed).mockResolvedValueOnce([
      { id: KIM, username: "kim", display_name: null },
      { id: LEE, username: "lee", display_name: null },
    ]);
    // Lee and the replier blocked each other.
    vi.mocked(store.blockedEitherWay).mockImplementation(
      async (a, b) => [a, b].includes(LEE) && [a, b].includes(ME),
    );
    saves();
    expect(await postReply("album", 7, "@kim @lee fair.")).toMatchObject({ ok: true });
    expect(store.replyTarget).toHaveBeenCalledWith("album", 7);
    expect(store.saveMentions).toHaveBeenCalledWith(41, [KIM]);
  });

  it("keeps nobody it names who has no connection with the replier or the thread", async () => {
    vi.mocked(store.peopleNamed).mockResolvedValueOnce([
      { id: KIM, username: "kim", display_name: null },
    ]);
    vi.mocked(store.followsEitherWay).mockResolvedValueOnce(new Set());
    saves();
    expect(await postReply("album", 7, "@kim fair.")).toMatchObject({
      ok: true,
      reply: { mentions: ["Kim"] },
    });
    expect(store.repliedIn).toHaveBeenCalledWith("album", 7, [KIM]);
    expect(store.saveMentions).not.toHaveBeenCalled();
  });

  it("still posts when keeping who it names fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(store.peopleNamed).mockResolvedValueOnce([
      { id: KIM, username: "kim", display_name: null },
    ]);
    vi.mocked(store.saveMentions).mockRejectedValueOnce(new Error("down"));
    saves();
    expect(await postReply("album", 7, "@kim fair.")).toMatchObject({
      ok: true,
      reply: { id: 41, mentions: ["Kim"] },
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("refuses nothing, too much, and the disrespectful, before asking anything", async () => {
    expect(await postReply("take", 9, "   ")).toEqual({ ok: false, error: "Say something first." });
    expect(await postReply("take", 9, "x".repeat(1001))).toEqual({
      ok: false,
      error: "Keep it to 1,000 characters.",
    });
    expect(await postReply("take", 9, "HATEFUL")).toEqual({
      ok: false,
      error: "Please keep it respectful.",
    });
    expect(db.fake.calls).toEqual([]);
  });

  it("trims all whitespace, and measures the limit after trimming", async () => {
    const pad = " \u00a0\u3000\n\t";
    expect(await postReply("album", 7, pad)).toEqual({ ok: false, error: "Say something first." });
    saves();
    await postReply("album", 7, pad + "x".repeat(1000) + pad);
    expect(inserted()).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "x".repeat(1000), rating_id: 7 }],
    });
  });

  it("won't let you reply on a take whose matchup is open until you've picked", async () => {
    db.state = "locked";
    expect(await postReply("take", 9, "@kim hi")).toEqual({
      ok: false,
      error: "Pick a side first, then join in.",
    });
    expect(replyable).toHaveBeenCalledWith("take", 9);
    expect(inserted()).toEqual([]);
    expect(notifyReply).not.toHaveBeenCalled();
  });

  it("lets you reply on a take once it's open for you", async () => {
    saves();
    expect(await postReply("take", 9, "Fair.")).toMatchObject({ ok: true });
    expect(inserted()).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "Fair.", versus_take_id: 9 }],
    });
  });

  it("writes with the server's client, as you, never through your own session", async () => {
    saves();
    await postReply("album", 7, "Fair.");
    expect(inserted()).toEqual([
      { table: "replies", method: "insert", args: [{ user_id: ME, body: "Fair.", rating_id: 7 }] },
    ]);
    expect(db.fake.callsOn("replies")).toEqual([]);
  });

  it("stops you at 50 replies in one thread", async () => {
    db.admin.answer("replies", { count: 50, error: null });
    expect(await postReply("artist", 8, "Again.")).toEqual({
      ok: false,
      error: "That's the most replies you can post here.",
    });
    expect(db.admin.callsOn("replies")).toEqual(
      expect.arrayContaining([
        { table: "replies", method: "eq", args: ["user_id", ME] },
        { table: "replies", method: "eq", args: ["artist_rating_id", 8] },
      ]),
    );
    expect(inserted()).toEqual([]);
    db.admin.answer("replies", { count: 49, error: null }, { data: saved, error: null });
    expect(await postReply("artist", 8, "Again.")).toMatchObject({ ok: true });
  });

  it("drops format characters before measuring and saving", async () => {
    // A direction override would flip how the rest of the thread reads.
    saves();
    await postReply("album", 7, "\u202Eright\u200B way\u202C");
    expect(inserted()).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "right way", rating_id: 7 }],
    });
    // 1,000 characters of words fit, however many invisible ones come with them.
    saves();
    await postReply("album", 7, "x".repeat(1000) + "\u200B".repeat(20));
    expect(inserted()).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "x".repeat(1000), rating_id: 7 }],
    });
  });

  it("refuses a reply made only of invisible characters", async () => {
    expect(await postReply("album", 7, " \u202E\u200B\uFEFF\u2066 ")).toEqual({
      ok: false,
      error: "Say something first.",
    });
    expect(db.fake.calls).toEqual([]);
    expect(db.admin.calls).toEqual([]);
  });

  it("refuses a kind or id it doesn't know", async () => {
    expect(await postReply("song" as "album", 7, "Hi.")).toMatchObject({ ok: false });
    expect(await postReply("album", -1, "Hi.")).toMatchObject({ ok: false });
  });

  it("needs somebody signed in, within the post limit", async () => {
    db.user = null;
    expect(await postReply("album", 7, "Hi.")).toEqual({ ok: false, error: "Log in to reply." });
    db.user = { id: ME, email: null };
    db.limited = true;
    expect(await postReply("album", 7, "Hi.")).toEqual({
      ok: false,
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
  });

  it("says a review is gone, or a take needs a pick, without saving", async () => {
    db.state = "gone";
    expect(await postReply("album", 7, "Hi.")).toEqual({
      ok: false,
      error: "This review has gone.",
    });
    db.state = "locked";
    expect(await postReply("take", 9, "Hi.")).toEqual({
      ok: false,
      error: "Pick a side first, then join in.",
    });
    expect(inserted()).toEqual([]);
  });

  it("turns the database's refusals into plain words, and doesn't push", async () => {
    answersPosting(
      {
        data: null,
        error: {
          code: "23514",
          message:
            'new row for relation "replies" violates check constraint "replies_thread_has_owner"',
        },
      },
      { data: null, error: { code: "PGRST205", message: "no table" } },
      {
        data: null,
        error: { code: "23503", message: "fk", details: 'Key is not present in table "profiles".' },
      },
    );
    expect(await postReply("album", 7, "Hi.")).toEqual({
      ok: false,
      error: "This review has gone.",
    });
    expect(await postReply("album", 7, "Hi.")).toEqual({
      ok: false,
      error: "Replies aren't available yet.",
    });
    expect(await postReply("album", 7, "Hi.")).toEqual({
      ok: false,
      error: "Pick a username first, then come back.",
    });
    expect(notifyReply).not.toHaveBeenCalled();
  });
});

describe("deleteReply", () => {
  it("deletes a reply you may delete", async () => {
    db.fake.answer("replies", { data: [{ id: 41 }], error: null });
    expect(await deleteReply(41)).toEqual({ ok: true });
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "eq",
      args: ["id", 41],
    });
    expect(allowUser).toHaveBeenCalledWith("write", ME);
  });

  it("says so when there was nothing of yours to delete", async () => {
    db.fake.answer("replies", { data: [], error: null });
    expect(await deleteReply(41)).toEqual({ ok: false, error: "Couldn't delete that reply." });
  });

  it("needs a real id and somebody signed in", async () => {
    expect(await deleteReply(0)).toMatchObject({ ok: false });
    db.user = null;
    expect(await deleteReply(41)).toEqual({ ok: false, error: "Log in first." });
  });
});
