import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

const ME = "11111111-1111-4111-8111-111111111111";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";

const db = vi.hoisted(() => ({
  /** The visitor's own client: ownership checks, albums, positions. */
  fake: null as unknown as FakeSupabase,
  /** The service role's, which alone writes a list's words (migration 0027). */
  admin: null as unknown as FakeSupabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.fake.client,
  getCurrentUser: async () => ({ id: ME, email: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/lists", () => ({ LIST_LIMIT: 100 }));
vi.mock("@/lib/rate-limit", () => ({ allowUser: vi.fn(async () => true), TOO_MANY: "Slow down." }));
vi.mock("@/lib/content-filter", () => ({
  isClean: (text: string) => !text.includes("UNCLEAN"),
  isRespectful: (text: string) => !text.includes("HATEFUL"),
  NOT_CLEAN: "Please choose something else.",
  NOT_RESPECTFUL: "Please keep it respectful.",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { fakeSupabase } from "../../../test/fake-supabase";
import { createList, setListNote, updateList } from "./actions";

/** The writes made on one table through one client. */
function writes(client: FakeSupabase, table: string) {
  return client
    .callsOn(table)
    .filter((call) => ["insert", "update", "upsert"].includes(call.method));
}

/** The ownership check finds the list: it's the visitor's. */
function ownsList() {
  db.fake.answer("lists", { data: { id: 5 }, error: null });
}

beforeEach(() => {
  db.fake = fakeSupabase();
  db.admin = fakeSupabase();
});

describe("createList", () => {
  it("writes the list with the service role, as the signed-in person", async () => {
    db.admin.answer("lists", { data: { id: 5 }, error: null });
    expect(
      await createList({ title: " Desert island ", description: "Ten.", ranked: true }),
    ).toEqual({ ok: true, id: 5 });
    expect(writes(db.admin, "lists")[0]?.args[0]).toEqual({
      user_id: ME,
      title: "Desert island",
      description: "Ten.",
      ranked: true,
    });
    expect(writes(db.fake, "lists")).toEqual([]);
  });

  it("starts it with an album through the person's own session", async () => {
    db.admin.answer("lists", { data: { id: 5 }, error: null });
    await createList({ title: "Mine", releaseMbid: ILLMATIC });
    expect(writes(db.fake, "list_items")[0]?.args[0]).toEqual({
      list_id: 5,
      release_mbid: ILLMATIC,
      position: 1,
    });
    expect(db.admin.callsOn("list_items")).toEqual([]);
  });

  it("asks for a username first when there's no profile", async () => {
    db.admin.answer("lists", { data: null, error: { code: "23503", message: "profiles" } });
    expect(await createList({ title: "Mine" })).toEqual({
      ok: false,
      error: "Pick a username first, then come back.",
    });
  });

  it("refuses a title that isn't clean and writes nothing", async () => {
    expect(await createList({ title: "UNCLEAN" })).toEqual({
      ok: false,
      error: "Please choose something else.",
    });
    expect(db.admin.calls).toEqual([]);
  });
});

describe("updateList", () => {
  it("writes the words with the service role, only on the person's own list", async () => {
    ownsList();
    db.admin.answer("lists", { data: [{ id: 5 }], error: null });
    expect(await updateList(5, { title: "Renamed", description: "", ranked: false })).toEqual({
      ok: true,
    });
    const calls = db.admin.callsOn("lists");
    expect(writes(db.admin, "lists")[0]?.args[0]).toEqual({
      title: "Renamed",
      description: null,
      ranked: false,
      updated_at: expect.any(String),
    });
    expect(calls).toContainEqual({ table: "lists", method: "eq", args: ["id", 5] });
    expect(calls).toContainEqual({ table: "lists", method: "eq", args: ["user_id", ME] });
    expect(writes(db.fake, "lists")).toEqual([]);
  });

  it("leaves somebody else's list alone", async () => {
    expect(await updateList(5, { title: "Mine now", ranked: false })).toEqual({
      ok: false,
      error: "That list isn't yours to change.",
    });
    expect(db.admin.calls).toEqual([]);
  });
});

describe("setListNote", () => {
  it("writes the note with the service role once the list is theirs", async () => {
    ownsList();
    db.admin.answer("list_items", { data: [{ list_id: 5 }], error: null });
    expect(await setListNote(5, ILLMATIC, " Start here. ")).toEqual({ ok: true });
    expect(db.admin.callsOn("list_items").map(({ method, args }) => [method, ...args])).toEqual([
      ["from", "list_items"],
      ["update", { note: "Start here." }],
      ["eq", "list_id", 5],
      ["eq", "release_mbid", ILLMATIC],
      ["select", "list_id"],
    ]);
    expect(writes(db.fake, "list_items")).toEqual([]);
    // Moving the list up the recent lists stays on the person's own session.
    expect(writes(db.fake, "lists")).toHaveLength(1);
  });

  it("refuses a disrespectful note and writes nothing", async () => {
    expect(await setListNote(5, ILLMATIC, "HATEFUL")).toEqual({
      ok: false,
      error: "Please keep it respectful.",
    });
    expect(db.admin.calls).toEqual([]);
  });

  it("leaves a note on somebody else's list alone", async () => {
    expect(await setListNote(5, ILLMATIC, "Mine.")).toEqual({
      ok: false,
      error: "That list isn't yours to change.",
    });
    expect(db.admin.calls).toEqual([]);
  });
});
