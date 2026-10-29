import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  user: null as { id: string; email: string | null } | null,
  limited: false,
  state: "open" as "open" | "locked" | "gone",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => db.user,
}));
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
vi.mock("@/lib/push/events", () => ({ notifyReply: vi.fn(async () => {}) }));
vi.mock("@/lib/push/later", () => ({ later: (task: () => Promise<unknown>) => void task() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { allowUser } from "@/lib/rate-limit";
import { notifyReply } from "@/lib/push/events";
import { replyable } from "@/lib/replies";
import { deleteReply, postReply } from "./actions";

const saved = {
  id: 41,
  body: "@kim fair.",
  created_at: "2026-10-29T08:00:00Z",
  profiles: { id: ME, username: "me", display_name: null, avatar_url: null },
};

beforeEach(() => {
  db.fake = fakeSupabase();
  db.user = { id: ME, email: null };
  db.limited = false;
  db.state = "open";
});

describe("postReply", () => {
  it("saves the trimmed reply as you, then pushes", async () => {
    db.fake.answer("replies", { data: saved, error: null });
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
    expect(db.fake.callsOn("replies")).toContainEqual({
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
    db.fake.answer("replies", { data: saved, error: null });
    await postReply("album", 7, pad + "x".repeat(1000) + pad);
    expect(db.fake.callsOn("replies")).toContainEqual({
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
    expect(db.fake.callsOn("replies")).toEqual([]);
    expect(notifyReply).not.toHaveBeenCalled();
  });

  it("lets you reply on a take once it's open for you", async () => {
    db.fake.answer("replies", { data: saved, error: null });
    expect(await postReply("take", 9, "Fair.")).toMatchObject({ ok: true });
    expect(db.fake.callsOn("replies")).toContainEqual({
      table: "replies",
      method: "insert",
      args: [{ user_id: ME, body: "Fair.", versus_take_id: 9 }],
    });
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
    expect(db.fake.callsOn("replies")).toEqual([]);
  });

  it("turns the database's refusals into plain words, and doesn't push", async () => {
    db.fake.answer(
      "replies",
      { data: null, error: { code: "42501", message: "row-level security" } },
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
