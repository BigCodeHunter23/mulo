import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server actions can be called directly by anyone, page or no page. These
 * check that every one of them refuses a signed-out caller before touching
 * the database, and that list changes refuse somebody who doesn't own the
 * list.
 */

const session = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  /** What the database answers: nothing, unless a test says otherwise. */
  db: { touched: 0 },
  /** Whether the rate limiter says no. */
  limited: false,
}));

/**
 * A stand-in Supabase client: every query finds nothing. The client itself
 * is a plain object (it gets awaited); the queries hanging off it are
 * thenable, like the real query builder.
 */
function emptyClient() {
  session.db.touched += 1;
  const result = { data: null, error: null, count: 0 };
  const query = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (key === "then") {
            return (resolve: (value: unknown) => void) => resolve({ ...result, data: [] });
          }
          if (key === "maybeSingle" || key === "single") return () => Promise.resolve(result);
          return () => query();
        },
      },
    );
  return {
    from: query,
    rpc: (name: string) =>
      name === "rate_limit_hit"
        ? Promise.resolve({ data: !session.limited, error: null })
        : query(),
    storage: { from: query },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => session.user),
  createClient: vi.fn(async () => emptyClient()),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => emptyClient()) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => emptyClient()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const OTHER = "1f9df192-a621-4f54-8850-2c5373b7eac9";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  session.user = null;
  session.db.touched = 0;
  session.limited = false;
});

describe("over the rate limit", () => {
  beforeEach(() => {
    session.user = { id: OTHER, email: "someone@example.com" };
    session.limited = true;
  });

  const TOO_MANY = /doing that a lot/;

  it.each([
    ["rate", async () => (await import("@/app/ratings/actions")).rate("album", MBID, 8)],
    [
      "setReaction",
      async () => (await import("@/app/reactions/actions")).setReaction("album", 1, 1),
    ],
    [
      "setFollowing",
      async () => (await import("@/app/u/[username]/actions")).setFollowing(MBID, "alex", true),
    ],
    ["createList", async () => (await import("@/app/lists/actions")).createList({ title: "Mine" })],
    ["addToList", async () => (await import("@/app/lists/actions")).addToList(1, MBID)],
    ["postTake", async () => (await import("@/app/versus/actions")).postTake(1, "Obviously")],
    [
      "nominateMatchup",
      async () => (await import("@/app/versus/actions")).nominateMatchup(MBID, OTHER),
    ],
  ])("%s says so and does nothing", async (_name, call) => {
    const result = (await call()) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(TOO_MANY);
  });

  it("a report says so", async () => {
    const { submitReport } = await import("@/app/report/actions");
    const result = await submitReport({}, form({ reason: "Spam or advertising", rating_id: "1" }));
    expect(result.error).toMatch(TOO_MANY);
  });

  it("logging in, signing up and resetting a password say so before asking Supabase", async () => {
    session.user = null;
    const { login, signup } = await import("@/app/login/actions");
    const { requestReset } = await import("@/app/auth/reset/actions");
    const details = form({ email: "someone@example.com", password: "longenough" });
    expect((await login({}, details)).error).toMatch(/Too many attempts/);
    expect((await signup({}, details)).error).toMatch(/Too many attempts/);
    expect((await requestReset({}, details)).error).toMatch(/Too many reset emails/);
  });
});

describe("signed out, every action refuses before touching the database", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["rate", async () => (await import("@/app/ratings/actions")).rate("album", MBID, 8)],
    [
      "saveReview",
      async () => (await import("@/app/ratings/actions")).saveReview("album", MBID, "Great"),
    ],
    [
      "removeRating",
      async () => (await import("@/app/ratings/actions")).removeRating("album", MBID),
    ],
    [
      "setReaction",
      async () => (await import("@/app/reactions/actions")).setReaction("album", 1, 1),
    ],
    [
      "saveTopPicks",
      async () => (await import("@/app/goat/actions")).saveTopPicks("album", [MBID]),
    ],
    ["createList", async () => (await import("@/app/lists/actions")).createList({ title: "Mine" })],
    [
      "updateList",
      async () =>
        (await import("@/app/lists/actions")).updateList(1, { title: "Mine", ranked: false }),
    ],
    ["deleteList", async () => (await import("@/app/lists/actions")).deleteList(1)],
    ["addToList", async () => (await import("@/app/lists/actions")).addToList(1, MBID)],
    ["removeFromList", async () => (await import("@/app/lists/actions")).removeFromList(1, MBID)],
    ["moveInList", async () => (await import("@/app/lists/actions")).moveInList(1, MBID, 2)],
    ["setListNote", async () => (await import("@/app/lists/actions")).setListNote(1, MBID, "Note")],
    ["castVote", async () => (await import("@/app/versus/actions")).castVote(1, "left")],
    ["postTake", async () => (await import("@/app/versus/actions")).postTake(1, "Obviously")],
    ["deleteTake", async () => (await import("@/app/versus/actions")).deleteTake(1)],
    [
      "nominateMatchup",
      async () => (await import("@/app/versus/actions")).nominateMatchup(MBID, OTHER),
    ],
    ["backNomination", async () => (await import("@/app/versus/actions")).backNomination(1, true)],
    [
      "saveRankOff",
      async () =>
        (await import("@/app/u/[username]/mixtape/actions")).saveRankOff("2026-09", "album", MBID),
    ],
    [
      "setFollowing",
      async () => (await import("@/app/u/[username]/actions")).setFollowing(OTHER, "alex", true),
    ],
    [
      "saveRaisedOn",
      async () =>
        (await import("@/app/raised-on/actions")).saveRaisedOn({
          mbid: MBID,
          era: null,
          scene: null,
          useAsPicture: false,
        }),
    ],
    ["getInviteLink", async () => (await import("@/app/invite/actions")).getInviteLink()],
    [
      "saveProfile",
      async () =>
        (await import("@/app/profile/actions")).saveProfile({}, form({ username: "alex" })),
    ],
    [
      "submitReport",
      async () =>
        (await import("@/app/report/actions")).submitReport(
          {},
          form({ reason: "Spam or advertising", rating_id: "1" }),
        ),
    ],
    [
      "updatePassword",
      async () =>
        (await import("@/app/auth/update-password/actions")).updatePassword(
          {},
          form({ password: "longenough", confirm: "longenough" }),
        ),
    ],
    [
      "changePassword",
      async () =>
        (await import("@/app/profile/account/actions")).changePassword(
          {},
          form({ current: "longenough", next: "longenough2" }),
        ),
    ],
    [
      "changeEmail",
      async () =>
        (await import("@/app/profile/account/actions")).changeEmail(
          {},
          form({ email: "new@example.com", current: "longenough" }),
        ),
    ],
    [
      "deleteAccount",
      async () =>
        (await import("@/app/profile/account/actions")).deleteAccount(
          {},
          form({ current: "longenough", confirm: "DELETE" }),
        ),
    ],
  ];

  it.each(cases)("%s", async (_name, call) => {
    const result = (await call()) as { ok?: boolean; error?: string };
    expect(result.ok === true).toBe(false);
    expect(result.error).toBeTruthy();
    expect(session.db.touched).toBe(0);
  });

  it.each([
    [
      "setReportStatus",
      async () => (await import("@/app/admin/reports/actions")).setReportStatus(1, "dismissed"),
    ],
    [
      "removeReview",
      async () => (await import("@/app/admin/reports/actions")).removeReview("album", 1),
    ],
    ["removeList", async () => (await import("@/app/admin/reports/actions")).removeList(1)],
    ["removeTake", async () => (await import("@/app/admin/reports/actions")).removeTake(1)],
  ])("admin %s does nothing", async (_name, call) => {
    await call();
    expect(session.db.touched).toBe(0);
  });
});

describe("signed in, but not the owner", () => {
  beforeEach(() => {
    session.user = { id: OTHER, email: "someone@example.com" };
  });

  it.each([
    [
      "updateList",
      async () =>
        (await import("@/app/lists/actions")).updateList(1, { title: "Theirs", ranked: false }),
    ],
    ["deleteList", async () => (await import("@/app/lists/actions")).deleteList(1)],
    ["addToList", async () => (await import("@/app/lists/actions")).addToList(1, MBID)],
    ["removeFromList", async () => (await import("@/app/lists/actions")).removeFromList(1, MBID)],
    ["moveInList", async () => (await import("@/app/lists/actions")).moveInList(1, MBID, 2)],
    ["setListNote", async () => (await import("@/app/lists/actions")).setListNote(1, MBID, "Note")],
  ])("%s is refused", async (_name, call) => {
    const result = (await call()) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: "That list isn't yours to change." });
  });

  it("an admin action does nothing for somebody not on the list", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    const { removeList } = await import("@/app/admin/reports/actions");
    await removeList(1);
    expect(session.db.touched).toBe(0);
  });
});

describe("bad input is refused before anything else", () => {
  beforeEach(() => {
    session.user = { id: OTHER, email: "someone@example.com" };
  });

  it.each([
    [
      "a made-up rating kind",
      async () => (await import("@/app/ratings/actions")).rate("podcast" as never, MBID, 8),
    ],
    [
      "a score out of range",
      async () => (await import("@/app/ratings/actions")).rate("album", MBID, 11),
    ],
    [
      "an id that isn't an MBID",
      async () => (await import("@/app/ratings/actions")).rate("album", "../etc", 8),
    ],
    [
      "a song without its album",
      async () => (await import("@/app/ratings/actions")).rate("song", MBID, 8),
    ],
    [
      "a reaction of 5",
      async () => (await import("@/app/reactions/actions")).setReaction("album", 1, 5 as never),
    ],
    ["a negative list id", async () => (await import("@/app/lists/actions")).deleteList(-1)],
    [
      "a vote for the middle",
      async () => (await import("@/app/versus/actions")).castVote(1, "middle" as never),
    ],
    [
      "a follow of a non-id",
      async () =>
        (await import("@/app/u/[username]/actions")).setFollowing("not-a-user", "x", true),
    ],
  ])("%s", async (_name, call) => {
    const result = (await call()) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(session.db.touched).toBe(0);
  });

  it("a report needs exactly one thing to report", async () => {
    const { submitReport } = await import("@/app/report/actions");
    const both = await submitReport(
      {},
      form({ reason: "Spam or advertising", rating_id: "1", list_id: "2" }),
    );
    const none = await submitReport({}, form({ reason: "Spam or advertising" }));
    const nonsense = await submitReport(
      {},
      form({ reason: "Spam or advertising", rating_id: "1 OR 1=1" }),
    );
    for (const result of [both, none, nonsense]) expect(result.error).toBeTruthy();
    expect(session.db.touched).toBe(0);
  });

  it("a profile with a bad username or an over-long bio is refused", async () => {
    const { saveProfile } = await import("@/app/profile/actions");
    expect((await saveProfile({}, form({ username: "a b" }))).error).toMatch(/Usernames/);
    expect((await saveProfile({}, form({ username: "alex", bio: "x".repeat(301) }))).error).toMatch(
      /300/,
    );
    expect(session.db.touched).toBe(0);
  });
});
