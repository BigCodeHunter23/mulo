import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's Social and account endpoints (stage 8): lists,
 * notifications, reactions, reports, blocks, follows, invites, profile
 * editing, Raised On and the account. The lib functions and actions are
 * stand-ins, as in test/app-api.test.ts.
 */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

const lib = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  isHidden: vi.fn(),
  listBlocked: vi.fn(),
  getFollowingIds: vi.fn(),
  listFollows: vi.fn(),
  getEditableProfile: vi.fn(),
  getUserLists: vi.fn(),
  getRecentLists: vi.fn(),
  getListsWithAlbum: vi.fn(),
  getList: vi.fn(),
  getMyListsFor: vi.fn(),
  getNotifications: vi.fn(),
  getLatestNotificationAt: vi.fn(),
  getRaisedOn: vi.fn(),
  changePasswordFor: vi.fn(),
  setPasswordFor: vi.fn(),
  changeEmailFor: vi.fn(),
  deleteAccountFor: vi.fn(),
  exportFor: vi.fn(),
}));

const actions = vi.hoisted(() => ({
  createList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  addToList: vi.fn(),
  removeFromList: vi.fn(),
  moveInList: vi.fn(),
  setListNote: vi.fn(),
  setReaction: vi.fn(),
  submitReport: vi.fn(),
  setBlocked: vi.fn(),
  getInviteLink: vi.fn(),
  saveProfile: vi.fn(),
  saveRaisedOn: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
  allowUser: vi.fn(async () => !caller.limited),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://mulo.test" }));
vi.mock("@/lib/social", () => ({
  getProfileByUsername: lib.getProfileByUsername,
  getFollowingIds: lib.getFollowingIds,
  listFollows: lib.listFollows,
  getEditableProfile: lib.getEditableProfile,
}));
vi.mock("@/lib/blocks", () => ({ isHidden: lib.isHidden, listBlocked: lib.listBlocked }));
vi.mock("@/lib/lists", () => ({
  LIST_LIMIT: 100,
  getUserLists: lib.getUserLists,
  getRecentLists: lib.getRecentLists,
  getListsWithAlbum: lib.getListsWithAlbum,
  getList: lib.getList,
  getMyListsFor: lib.getMyListsFor,
}));
vi.mock("@/lib/notifications", () => ({
  getNotifications: lib.getNotifications,
  getLatestNotificationAt: lib.getLatestNotificationAt,
}));
vi.mock("@/lib/raised-on", () => ({ getRaisedOn: lib.getRaisedOn }));
vi.mock("@/lib/session-facts", () => ({ getSessionFacts: vi.fn(async () => FACTS) }));
vi.mock("@/lib/account", () => ({
  changePasswordFor: lib.changePasswordFor,
  setPasswordFor: lib.setPasswordFor,
  changeEmailFor: lib.changeEmailFor,
  deleteAccountFor: lib.deleteAccountFor,
}));
vi.mock("@/lib/export", async (original) => ({
  // The headers are the real ones; the read is a stand-in.
  ...(await original<typeof import("@/lib/export")>()),
  exportFor: lib.exportFor,
}));
vi.mock("@/app/lists/actions", () => ({
  createList: actions.createList,
  updateList: actions.updateList,
  deleteList: actions.deleteList,
  addToList: actions.addToList,
  removeFromList: actions.removeFromList,
  moveInList: actions.moveInList,
  setListNote: actions.setListNote,
}));
vi.mock("@/app/reactions/actions", () => ({ setReaction: actions.setReaction }));
vi.mock("@/app/report/actions", () => ({ submitReport: actions.submitReport }));
vi.mock("@/app/u/[username]/actions", () => ({ setBlocked: actions.setBlocked }));
vi.mock("@/app/invite/actions", () => ({ getInviteLink: actions.getInviteLink }));
vi.mock("@/app/profile/actions", () => ({ saveProfile: actions.saveProfile }));
vi.mock("@/app/raised-on/actions", () => ({ saveRaisedOn: actions.saveRaisedOn }));

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const ME = { id: "1f9df192-a621-4f54-8850-2c5373b7eac9", email: "me@example.com" };
/** How the caller signed in, which the account endpoints pass on. */
const FACTS = vi.hoisted(() => ({
  signInMethods: ["apple"],
  hasPassword: false,
  freshSignIn: true,
}));
const THEM = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
const PROFILE = {
  id: THEM,
  username: "alex",
  display_name: "Alex",
  avatar_url: null,
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
};
const LIST = {
  id: 5,
  title: "Debuts",
  description: null,
  ranked: true,
  updatedAt: "2026-10-01T00:00:00Z",
  count: 2,
  covers: [],
  ownerId: THEM,
  owner: { username: "alex", name: "Alex", avatarUrl: null },
};
const EMPTY_LIST = { ...LIST, id: 6, count: 0 };
const DETAIL = {
  id: 5,
  title: "Debuts",
  description: null,
  ranked: true,
  updatedAt: "2026-10-01T00:00:00Z",
  ownerId: THEM,
  owner: LIST.owner,
  items: [],
};

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://mulo.test/api/app/v1/${path}`, init);
}

function json(path: string, method: string, body: unknown) {
  return request(path, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Route parameters, as Next hands them to a handler. */
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function signIn() {
  caller.token = "good";
  caller.user = ME;
}

beforeEach(() => {
  caller.token = null;
  caller.user = null;
  caller.limited = false;
  for (const fn of Object.values(lib)) fn.mockReset();
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
  lib.getProfileByUsername.mockResolvedValue(PROFILE);
  lib.isHidden.mockResolvedValue(false);
  lib.getFollowingIds.mockResolvedValue([THEM]);
});

// ── Lists ──────────────────────────────────────────────────────────────

describe("GET lists", () => {
  const read = async () => (await import("@/app/api/app/v1/lists/route")).GET();

  it("is for people with an account, as the page is", async () => {
    expect((await read()).status).toBe(401);
  });

  it("answers your lists, then everyone's latest", async () => {
    signIn();
    lib.getUserLists.mockResolvedValue([EMPTY_LIST]);
    lib.getRecentLists.mockResolvedValue([LIST]);
    expect(await (await read()).json()).toEqual({ mine: [EMPTY_LIST], recent: [LIST] });
    expect(lib.getUserLists).toHaveBeenCalledWith(ME.id);
    expect(lib.getRecentLists).toHaveBeenCalledWith(24);
  });

  it("is limited like the other reads", async () => {
    signIn();
    caller.limited = true;
    expect((await read()).status).toBe(429);
  });
});

describe("POST lists", () => {
  const create = async (body: unknown) =>
    (await import("@/app/api/app/v1/lists/route")).POST(json("lists", "POST", body));

  it("hands the list to the website's own action, and answers its result", async () => {
    signIn();
    actions.createList.mockResolvedValue({ ok: true, id: 9 });
    const body = { title: "Debuts", description: "", ranked: true, releaseMbid: MBID };
    expect(await (await create(body)).json()).toEqual({ ok: true, id: 9 });
    expect(actions.createList).toHaveBeenCalledWith(body);
  });

  it("refuses a body it can't read", async () => {
    signIn();
    expect((await create({ title: 7 })).status).toBe(400);
    expect(actions.createList).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    expect((await create({ title: "Debuts" })).status).toBe(401);
  });
});

describe("lists/[id]", () => {
  const route = () => import("@/app/api/app/v1/lists/[id]/route");
  const get = async (id = "5") => (await route()).GET(request(`lists/${id}`), params({ id }));

  it("answers the list, whether it's yours, and how many it holds", async () => {
    signIn();
    lib.getList.mockResolvedValue(DETAIL);
    expect(await (await get()).json()).toEqual({ list: DETAIL, isOwner: false, limit: 100 });
    expect(lib.getList).toHaveBeenCalledWith(5);
    expect(lib.isHidden).toHaveBeenCalledWith(THEM);
  });

  it("says when it's yours", async () => {
    signIn();
    lib.getList.mockResolvedValue({ ...DETAIL, ownerId: ME.id });
    expect((await (await get()).json()).isOwner).toBe(true);
  });

  it("is 404 for an id that can't exist, a missing list, or a hidden owner", async () => {
    signIn();
    expect((await get("abc")).status).toBe(404);
    expect(lib.getList).not.toHaveBeenCalled();
    lib.getList.mockResolvedValue(null);
    expect(await (await get()).json()).toEqual({
      ok: false,
      error: "We couldn't find that list.",
    });
    lib.getList.mockResolvedValue(DETAIL);
    lib.isHidden.mockResolvedValue(true);
    expect((await get()).status).toBe(404);
  });

  it("is for people with an account", async () => {
    expect((await get()).status).toBe(401);
  });

  it("edits through the website's own action", async () => {
    signIn();
    const body = { title: "Better", description: "Why", ranked: false };
    const response = await (
      await route()
    ).PATCH(json("lists/5", "PATCH", body), params({ id: "5" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(actions.updateList).toHaveBeenCalledWith(5, body);
  });

  it("deletes through the website's own action", async () => {
    signIn();
    actions.deleteList.mockResolvedValue({ ok: false, error: "That list isn't yours to change." });
    const response = await (await route()).DELETE(request("lists/5"), params({ id: "5" }));
    expect(await response.json()).toEqual({ ok: false, error: "That list isn't yours to change." });
    expect(actions.deleteList).toHaveBeenCalledWith(5);
  });

  it("is 404 for a write to an id that can't exist", async () => {
    signIn();
    const response = await (await route()).DELETE(request("lists/0"), params({ id: "0" }));
    expect(response.status).toBe(404);
    expect(actions.deleteList).not.toHaveBeenCalled();
  });
});

describe("lists/[id]/items/[mbid]", () => {
  const route = () => import("@/app/api/app/v1/lists/[id]/items/[mbid]/route");
  const at = params({ id: "5", mbid: MBID });
  const path = `lists/5/items/${MBID}`;

  it("adds, moves, notes and removes through the website's own actions", async () => {
    signIn();
    await (await route()).PUT(request(path, { method: "PUT" }), at);
    expect(actions.addToList).toHaveBeenCalledWith(5, MBID);

    await (await route()).PATCH(json(path, "PATCH", { to: 3 }), at);
    expect(actions.moveInList).toHaveBeenCalledWith(5, MBID, 3);

    await (await route()).PATCH(json(path, "PATCH", { note: "Still great" }), at);
    expect(actions.setListNote).toHaveBeenCalledWith(5, MBID, "Still great");

    const removed = await (await route()).DELETE(request(path, { method: "DELETE" }), at);
    expect(await removed.json()).toEqual({ ok: true });
    expect(actions.removeFromList).toHaveBeenCalledWith(5, MBID);
  });

  it("refuses a change that's neither a move nor a note", async () => {
    signIn();
    expect((await (await route()).PATCH(json(path, "PATCH", {}), at)).status).toBe(400);
    expect(
      (await (await route()).PATCH(json(path, "PATCH", { to: 1, note: "x" }), at)).status,
    ).toBe(400);
  });

  it("needs a token", async () => {
    expect((await (await route()).PUT(request(path, { method: "PUT" }), at)).status).toBe(401);
    expect(actions.addToList).not.toHaveBeenCalled();
  });
});

describe("GET albums/[mbid]/lists", () => {
  const read = async (mbid = MBID) =>
    (await import("@/app/api/app/v1/albums/[mbid]/lists/route")).GET(
      request(`albums/${mbid}/lists`),
      params({ mbid }),
    );

  it("answers your lists with their ticks, and the non-empty lists it's on", async () => {
    signIn();
    const mine = [{ id: 1, title: "Mine", has: true, full: false }];
    lib.getMyListsFor.mockResolvedValue(mine);
    lib.getListsWithAlbum.mockResolvedValue([LIST, EMPTY_LIST]);
    expect(await (await read()).json()).toEqual({ mine, featured: [LIST] });
    expect(lib.getMyListsFor).toHaveBeenCalledWith(ME.id, MBID);
    expect(lib.getListsWithAlbum).toHaveBeenCalledWith(MBID);
  });

  it("keeps lists to people with an account, as the page does", async () => {
    expect(await (await read()).json()).toEqual({ mine: [], featured: [] });
    expect(lib.getListsWithAlbum).not.toHaveBeenCalled();
  });

  it("is 404 for an id that can't be an album", async () => {
    signIn();
    expect((await read("nope")).status).toBe(404);
  });
});

describe("GET users/[username]/lists", () => {
  const read = async (username = "alex") =>
    (await import("@/app/api/app/v1/users/[username]/lists/route")).GET(
      request(`users/${username}/lists`),
      params({ username }),
    );

  it("answers their non-empty lists", async () => {
    signIn();
    lib.getUserLists.mockResolvedValue([LIST, EMPTY_LIST]);
    expect(await (await read()).json()).toEqual([LIST]);
    expect(lib.getUserLists).toHaveBeenCalledWith(THEM);
  });

  it("is 404 for somebody blocked either way round", async () => {
    signIn();
    lib.isHidden.mockResolvedValue(true);
    expect((await read()).status).toBe(404);
  });

  it("is for people with an account", async () => {
    expect((await read()).status).toBe(401);
  });
});

// ── Notifications ──────────────────────────────────────────────────────

describe("notifications", () => {
  const FOLLOW = {
    kind: "follow",
    key: `follow-${THEM}`,
    at: "2026-10-27T01:00:00Z",
    person: { id: THEM, username: "alex", display_name: null, avatar_url: null },
  };

  it("answers them, and who you already follow", async () => {
    signIn();
    lib.getNotifications.mockResolvedValue([FOLLOW]);
    const response = await (await import("@/app/api/app/v1/notifications/route")).GET();
    expect(await response.json()).toEqual({ notifications: [FOLLOW], following: [THEM] });
    expect(lib.getNotifications).toHaveBeenCalledWith(ME.id);
    expect(lib.getFollowingIds).toHaveBeenCalledWith(ME.id);
  });

  it("answers the newest one's time, for the bell", async () => {
    signIn();
    lib.getLatestNotificationAt.mockResolvedValue("2026-10-27T01:00:00Z");
    const response = await (await import("@/app/api/app/v1/notifications/latest/route")).GET();
    expect(await response.json()).toEqual({ latest: "2026-10-27T01:00:00Z" });
  });

  it("needs a token", async () => {
    expect((await (await import("@/app/api/app/v1/notifications/route")).GET()).status).toBe(401);
    expect((await (await import("@/app/api/app/v1/notifications/latest/route")).GET()).status).toBe(
      401,
    );
  });
});

// ── Reactions, reports, blocks ─────────────────────────────────────────

describe("PUT reactions", () => {
  const react = async (body: unknown) =>
    (await import("@/app/api/app/v1/reactions/route")).PUT(json("reactions", "PUT", body));

  it("loves, nahs and takes back through the website's own action", async () => {
    signIn();
    expect(await (await react({ kind: "album", ratingId: 7, value: 1 })).json()).toEqual({
      ok: true,
    });
    expect(actions.setReaction).toHaveBeenCalledWith("album", 7, 1);
    await react({ kind: "take", ratingId: 3, value: 0 });
    expect(actions.setReaction).toHaveBeenLastCalledWith("take", 3, 0);
  });

  it("refuses a value or kind it doesn't know", async () => {
    signIn();
    expect((await react({ kind: "album", ratingId: 7, value: 2 })).status).toBe(400);
    expect((await react({ kind: "song", ratingId: 7, value: 1 })).status).toBe(400);
    expect(actions.setReaction).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    expect((await react({ kind: "album", ratingId: 7, value: 1 })).status).toBe(401);
  });
});

describe("POST reports", () => {
  const report = async (body: unknown) =>
    (await import("@/app/api/app/v1/reports/route")).POST(json("reports", "POST", body));
  const sent = () => actions.submitReport.mock.calls[0]?.[1] as FormData;

  it("sends a list's report through the website's own form action", async () => {
    signIn();
    actions.submitReport.mockResolvedValue({
      message: "Thanks for the report. We'll take a look.",
    });
    const response = await report({
      target: { kind: "list", id: 5 },
      reason: "Spam or advertising",
      detail: "Links everywhere",
    });
    expect(await response.json()).toEqual({
      ok: true,
      message: "Thanks for the report. We'll take a look.",
    });
    const form = sent();
    expect(form.get("list_id")).toBe("5");
    expect(form.get("rating_id")).toBe("");
    expect(form.get("profile_id")).toBe("");
    expect(form.get("reason")).toBe("Spam or advertising");
    expect(form.get("detail")).toBe("Links everywhere");
  });

  it("sends a person's report by their id", async () => {
    signIn();
    actions.submitReport.mockResolvedValue({ message: "Thanks" });
    await report({ target: { kind: "profile", id: THEM }, reason: "Impersonation" });
    expect(sent().get("profile_id")).toBe(THEM);
    expect(sent().get("detail")).toBe("");
  });

  it("passes on the action's refusal, in its words", async () => {
    signIn();
    actions.submitReport.mockResolvedValue({ error: "Please choose a reason." });
    expect(await (await report({ target: { kind: "rating", id: 1 }, reason: "" })).json()).toEqual({
      ok: false,
      error: "Please choose a reason.",
    });
  });

  it("refuses a target it doesn't know", async () => {
    signIn();
    expect((await report({ target: { kind: "song", id: 1 }, reason: "x" })).status).toBe(400);
    expect(actions.submitReport).not.toHaveBeenCalled();
  });
});

describe("blocks", () => {
  it("blocks and unblocks through the website's own action", async () => {
    signIn();
    const response = await (
      await import("@/app/api/app/v1/blocks/[userId]/route")
    ).PUT(
      json(`blocks/${THEM}`, "PUT", { blocked: true, username: "alex" }),
      params({ userId: THEM }),
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(actions.setBlocked).toHaveBeenCalledWith(THEM, "alex", true);
  });

  it("answers who you've blocked", async () => {
    signIn();
    const blocked = [{ id: THEM, username: "alex", display_name: null, avatar_url: null }];
    lib.listBlocked.mockResolvedValue(blocked);
    const response = await (await import("@/app/api/app/v1/me/blocks/route")).GET();
    expect(await response.json()).toEqual(blocked);
  });

  it("needs a token", async () => {
    expect((await (await import("@/app/api/app/v1/me/blocks/route")).GET()).status).toBe(401);
  });
});

// ── Follows and invites ────────────────────────────────────────────────

describe("GET users/[username]/follows", () => {
  const read = async (query: string, username = "alex") =>
    (await import("@/app/api/app/v1/users/[username]/follows/route")).GET(
      request(`users/${username}/follows${query}`),
      params({ username }),
    );
  const person = (n: number) => ({ ...PROFILE, id: `id-${n}`, username: `p${n}` });

  it("answers a page of who they follow, and whether there's more", async () => {
    signIn();
    lib.listFollows.mockResolvedValue(Array.from({ length: 51 }, (_, n) => person(n)));
    const body = await (await read("?show=following&page=2")).json();
    expect(body.people).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(body.following).toEqual([THEM]);
    expect(lib.listFollows).toHaveBeenCalledWith(THEM, "following", { offset: 50, size: 51 });
  });

  it("answers their followers for anything else", async () => {
    signIn();
    lib.listFollows.mockResolvedValue([]);
    expect(await (await read("?show=everyone")).json()).toEqual({
      people: [],
      following: [THEM],
      hasMore: false,
    });
    expect(lib.listFollows).toHaveBeenCalledWith(THEM, "followers", { offset: 0, size: 51 });
  });

  it("is 404 for somebody blocked, and for people without an account", async () => {
    expect((await read("")).status).toBe(401);
    signIn();
    lib.isHidden.mockResolvedValue(true);
    expect((await read("")).status).toBe(404);
  });
});

describe("POST me/invite", () => {
  const invite = async () => (await import("@/app/api/app/v1/me/invite/route")).POST();

  it("answers the whole join link", async () => {
    signIn();
    actions.getInviteLink.mockResolvedValue({ ok: true, path: "/join/0123456789" });
    expect(await (await invite()).json()).toEqual({
      ok: true,
      url: "https://mulo.test/join/0123456789",
    });
  });

  it("passes on the action's refusal", async () => {
    signIn();
    actions.getInviteLink.mockResolvedValue({
      ok: false,
      error: "Pick a username first, then invite friends.",
    });
    expect(await (await invite()).json()).toEqual({
      ok: false,
      error: "Pick a username first, then invite friends.",
    });
  });

  it("needs a token", async () => {
    expect((await invite()).status).toBe(401);
  });
});

// ── Profile, photo and Raised On ───────────────────────────────────────

const OWN = { username: "me", display_name: "Me", bio: "Hi", avatar_url: null };
const RAISED = {
  era: null,
  scene: null,
  album: { mbid: MBID, title: "OK Computer", artist: "Radiohead", cover: null, year: 1997 },
};

describe("GET me/profile", () => {
  const read = async () => (await import("@/app/api/app/v1/me/profile/route")).GET();

  it("answers what the edit screen starts from", async () => {
    signIn();
    lib.getEditableProfile.mockResolvedValue(OWN);
    lib.getRaisedOn.mockResolvedValue(RAISED);
    expect(await (await read()).json()).toEqual({ ...OWN, raisedOn: RAISED });
    expect(lib.getEditableProfile).toHaveBeenCalledWith(ME.id);
    expect(lib.getRaisedOn).toHaveBeenCalledWith(ME.id);
  });

  it("is 404 before there's a username", async () => {
    signIn();
    lib.getEditableProfile.mockResolvedValue(null);
    expect(await (await read()).json()).toEqual({ ok: false, error: "Pick a username first." });
  });

  it("needs a token", async () => {
    expect((await read()).status).toBe(401);
  });
});

describe("PUT me/profile", () => {
  it("sends the bio along when it's given", async () => {
    signIn();
    actions.saveProfile.mockResolvedValue({ message: "Profile saved." });
    const response = await (
      await import("@/app/api/app/v1/me/profile/route")
    ).PUT(json("me/profile", "PUT", { username: "me", display_name: "Me", bio: "" }));
    expect(await response.json()).toEqual({ ok: true });
    const form = actions.saveProfile.mock.calls[0]?.[1] as FormData;
    expect(form.has("bio")).toBe(true);
    expect(form.get("bio")).toBe("");
  });
});

describe("POST me/avatar", () => {
  const upload = async (body: BodyInit | null, type?: string) =>
    (await import("@/app/api/app/v1/me/avatar/route")).POST(
      request("me/avatar", {
        method: "POST",
        body,
        ...(type ? { headers: { "content-type": type } } : {}),
      }),
    );
  const photo = () => {
    const form = new FormData();
    form.set(
      "avatar",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "me.jpg", { type: "image/jpeg" }),
    );
    return form;
  };

  it("saves the photo through the website's own save, leaving the rest as it was", async () => {
    signIn();
    lib.getEditableProfile
      .mockResolvedValueOnce(OWN)
      .mockResolvedValueOnce({ ...OWN, avatar_url: "https://x/avatars/me/avatar.jpg?v=1" });
    actions.saveProfile.mockResolvedValue({ message: "Profile saved." });

    expect(await (await upload(photo())).json()).toEqual({
      ok: true,
      avatarUrl: "https://x/avatars/me/avatar.jpg?v=1",
    });
    const form = actions.saveProfile.mock.calls[0]?.[1] as FormData;
    expect(form.get("username")).toBe("me");
    expect(form.get("display_name")).toBe("Me");
    expect(form.has("bio")).toBe(false);
    expect(form.get("avatar")).toBeInstanceOf(File);
  });

  it("passes on the save's refusal, in its words", async () => {
    signIn();
    lib.getEditableProfile.mockResolvedValue(OWN);
    actions.saveProfile.mockResolvedValue({
      error: "That image is over 2MB. Please pick a smaller one.",
    });
    expect(await (await upload(photo())).json()).toEqual({
      ok: false,
      error: "That image is over 2MB. Please pick a smaller one.",
    });
  });

  it("refuses a body too big to be a 2MB photo before reading it", async () => {
    signIn();
    const response = await (
      await import("@/app/api/app/v1/me/avatar/route")
    ).POST(
      request("me/avatar", {
        method: "POST",
        body: photo(),
        headers: { "content-length": String(3 * 1024 * 1024) },
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      error: "That image is over 2MB. Please pick a smaller one.",
    });
    expect(actions.saveProfile).not.toHaveBeenCalled();
  });

  it("refuses a body with no photo, or no form at all", async () => {
    signIn();
    expect((await upload(new FormData())).status).toBe(400);
    expect((await upload("{}", "application/json")).status).toBe(400);
    expect(actions.saveProfile).not.toHaveBeenCalled();
  });

  it("needs a username first, and a token", async () => {
    expect((await upload(photo())).status).toBe(401);
    signIn();
    lib.getEditableProfile.mockResolvedValue(null);
    expect((await upload(photo())).status).toBe(404);
  });
});

describe("PUT me/raised-on", () => {
  const save = async (body: unknown) =>
    (await import("@/app/api/app/v1/me/raised-on/route")).PUT(json("me/raised-on", "PUT", body));

  it("saves through the website's own action", async () => {
    signIn();
    const body = { mbid: MBID, era: "90s", scene: "britpop", useAsPicture: true };
    expect(await (await save(body)).json()).toEqual({ ok: true });
    expect(actions.saveRaisedOn).toHaveBeenCalledWith(body);
  });

  it("refuses a body it can't read, and needs a token", async () => {
    expect((await save({ mbid: MBID, era: null, scene: null, useAsPicture: false })).status).toBe(
      401,
    );
    signIn();
    expect((await save({ mbid: MBID })).status).toBe(400);
  });
});

// ── The account ────────────────────────────────────────────────────────

describe("the account", () => {
  it("changes the password through the shared check", async () => {
    signIn();
    lib.changePasswordFor.mockResolvedValue({ ok: true, message: "Password changed." });
    const body = { current: "old-one", next: "new-one" };
    const response = await (
      await import("@/app/api/app/v1/me/password/route")
    ).PUT(json("me/password", "PUT", body));
    expect(await response.json()).toEqual({ ok: true, message: "Password changed." });
    expect(lib.changePasswordFor).toHaveBeenCalledWith(ME, body, FACTS);
  });

  it("sets a first password through the shared check", async () => {
    signIn();
    lib.setPasswordFor.mockResolvedValue({ ok: true, message: "Password set." });
    const response = await (
      await import("@/app/api/app/v1/me/password/route")
    ).POST(json("me/password", "POST", { next: "new-one" }));
    expect(await response.json()).toEqual({ ok: true, message: "Password set." });
    expect(lib.setPasswordFor).toHaveBeenCalledWith(ME, { next: "new-one" }, FACTS);
  });

  it("needs a token and a body it can read to set one", async () => {
    const route = await import("@/app/api/app/v1/me/password/route");
    expect((await route.POST(json("me/password", "POST", { next: "new-one" }))).status).toBe(401);
    signIn();
    expect((await route.POST(json("me/password", "POST", { next: 1 }))).status).toBe(400);
    expect(lib.setPasswordFor).not.toHaveBeenCalled();
  });

  it("changes the email through the shared check", async () => {
    signIn();
    lib.changeEmailFor.mockResolvedValue({ ok: false, error: "That isn't your current password." });
    const body = { email: "new@example.com", current: "wrong" };
    const response = await (
      await import("@/app/api/app/v1/me/email/route")
    ).PUT(json("me/email", "PUT", body));
    expect(await response.json()).toEqual({
      ok: false,
      error: "That isn't your current password.",
    });
    expect(lib.changeEmailFor).toHaveBeenCalledWith(ME, body, FACTS);
  });

  it("deletes the account through the shared check", async () => {
    signIn();
    lib.deleteAccountFor.mockResolvedValue({ ok: true, message: "Your account is gone." });
    const body = { current: "right", confirm: "DELETE" };
    const response = await (
      await import("@/app/api/app/v1/me/route")
    ).DELETE(json("me", "DELETE", body));
    expect(await response.json()).toEqual({ ok: true });
    expect(lib.deleteAccountFor).toHaveBeenCalledWith(ME, body, FACTS);
  });

  it("deletes an account without a password, and says when Apple's link is left", async () => {
    signIn();
    lib.deleteAccountFor.mockResolvedValue({
      ok: true,
      message: "Your account is gone.",
      appleLinkLeft: true,
    });
    const response = await (
      await import("@/app/api/app/v1/me/route")
    ).DELETE(json("me", "DELETE", { confirm: "DELETE" }));
    expect(await response.json()).toEqual({ ok: true, appleLinkLeft: true });
    expect(lib.deleteAccountFor).toHaveBeenCalledWith(ME, { confirm: "DELETE" }, FACTS);
  });

  it("passes on a refused delete, in its words", async () => {
    signIn();
    lib.deleteAccountFor.mockResolvedValue({ ok: false, error: "That isn't your password." });
    const response = await (
      await import("@/app/api/app/v1/me/route")
    ).DELETE(json("me", "DELETE", { current: "wrong", confirm: "DELETE" }));
    expect(await response.json()).toEqual({ ok: false, error: "That isn't your password." });
  });

  it("answers a copy of your data as a file", async () => {
    signIn();
    lib.exportFor.mockResolvedValue({ body: '{"profile":null}', filename: "mulo-2026-10-27.json" });
    const response = await (await import("@/app/api/app/v1/me/export/route")).GET();
    expect(await response.json()).toEqual({ profile: null });
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="mulo-2026-10-27.json"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(lib.exportFor).toHaveBeenCalledWith(ME);
  });

  it("limits the copy like a change", async () => {
    signIn();
    caller.limited = true;
    expect((await (await import("@/app/api/app/v1/me/export/route")).GET()).status).toBe(429);
    expect(lib.exportFor).not.toHaveBeenCalled();
  });

  it("needs a token for all of it, and a body it can read", async () => {
    const me = await import("@/app/api/app/v1/me/route");
    expect(
      (await me.DELETE(json("me", "DELETE", { current: "x", confirm: "DELETE" }))).status,
    ).toBe(401);
    expect((await (await import("@/app/api/app/v1/me/export/route")).GET()).status).toBe(401);
    signIn();
    expect((await me.DELETE(json("me", "DELETE", { current: 1 }))).status).toBe(400);
    expect(lib.deleteAccountFor).not.toHaveBeenCalled();
  });
});
