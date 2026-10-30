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
  /** The buckets the rate limiter was asked about, in order. */
  buckets: [] as string[],
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
    rpc: (name: string, args?: { p_bucket?: string }) => {
      if (name !== "rate_limit_hit") return query();
      session.buckets.push(args?.p_bucket ?? "");
      return Promise.resolve({ data: !session.limited, error: null });
    },
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

/** How the caller signed in: an Apple account without a password, unless a test says otherwise. */
const signedIn = vi.hoisted(() => ({
  facts: {
    signInMethods: ["apple"] as ("email" | "apple" | "google" | "facebook")[],
    hasPassword: false,
    freshSignIn: false,
  },
  /** Whether the session came from a password reset link just now. */
  fromResetLink: false,
}));
vi.mock("@/lib/session-facts", () => ({
  getSessionFacts: vi.fn(async () => signedIn.facts),
  cameFromResetLink: vi.fn(async () => signedIn.fromResetLink),
}));
/** The real account work, watched, so a test can see what the page's actions pass on. */
vi.mock("@/lib/account", async (original) => {
  const real = await original<typeof import("@/lib/account")>();
  return {
    ...real,
    changePasswordFor: vi.fn(real.changePasswordFor),
    setPasswordFor: vi.fn(real.setPasswordFor),
    deleteAccountFor: vi.fn(real.deleteAccountFor),
    markHasPassword: vi.fn(async () => true),
  };
});

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
  session.buckets = [];
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
    [
      "setArtistFollowing",
      async () => (await import("@/app/artist/[mbid]/actions")).setArtistFollowing(MBID, true),
    ],
    [
      "followArtists",
      async () => (await import("@/app/artist/[mbid]/actions")).followArtists([MBID]),
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

describe("continuing with Apple or Google", () => {
  const oauth = {
    calls: [] as unknown[],
    result: { data: { url: "https://accounts.example/auth" }, error: null } as {
      data: { url: string | null };
      error: { message: string } | null;
    },
  };

  beforeEach(async () => {
    oauth.calls = [];
    oauth.result = { data: { url: "https://accounts.example/auth" }, error: null };
    const server = await import("@/lib/supabase/server");
    vi.mocked(server.createClient).mockImplementation((async () => ({
      ...emptyClient(),
      auth: {
        signInWithOAuth: async (args: unknown) => {
          oauth.calls.push(args);
          return oauth.result;
        },
      },
    })) as never);
  });

  it("an unknown provider is turned away", async () => {
    const { continueWith } = await import("@/app/login/actions");
    const result = await continueWith({}, form({ provider: "myspace", next: "/" }));
    expect(result.error).toMatch(/isn't available yet/);
    expect(oauth.calls).toHaveLength(0);
  });

  it("says so over the rate limit", async () => {
    session.limited = true;
    const { continueWith } = await import("@/app/login/actions");
    expect((await continueWith({}, form({ provider: "google" }))).error).toMatch(
      /Too many attempts/,
    );
    expect(oauth.calls).toHaveLength(0);
    // Its own bucket, so a shared address isn't shut out of logging in.
    expect(session.buckets).toEqual(["social"]);
  });

  it("sends the browser to the provider, back through /auth/confirm to a safe page", async () => {
    const { continueWith } = await import("@/app/login/actions");
    await expect(continueWith({}, form({ provider: "google", next: "/ratings" }))).rejects.toThrow(
      "redirect:https://accounts.example/auth",
    );
    const call = oauth.calls[0] as { provider: string; options: Record<string, string> };
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toContain("/auth/confirm?next=%2Fratings");
    expect(call.options.scopes).toBeUndefined();
  });

  it("asks Apple for the name and email, and ignores an outside next", async () => {
    const { continueWith } = await import("@/app/login/actions");
    await expect(
      continueWith({}, form({ provider: "apple", next: "https://evil.example" })),
    ).rejects.toThrow("redirect:");
    const call = oauth.calls[0] as { options: Record<string, string> };
    expect(call.options.scopes).toBe("name email");
    expect(call.options.redirectTo).toContain("next=%2F");
    expect(call.options.redirectTo).not.toContain("evil");
  });

  it("makes Google ask which account when confirming it's them, and only then", async () => {
    const { continueWith } = await import("@/app/login/actions");
    await expect(
      continueWith({}, form({ provider: "google", next: "/profile/account", confirm: "1" })),
    ).rejects.toThrow("redirect:");
    await expect(continueWith({}, form({ provider: "google" }))).rejects.toThrow("redirect:");
    const [confirming, plain] = oauth.calls as { options: Record<string, unknown> }[];
    expect(confirming?.options.queryParams).toEqual({ prompt: "select_account" });
    expect(plain?.options.queryParams).toBeUndefined();
  });

  it("names the signed-in account to Google when confirming, never one from the form", async () => {
    session.user = { id: OTHER, email: "someone@example.com" };
    const { continueWith } = await import("@/app/login/actions");
    await expect(
      continueWith(
        {},
        form({ provider: "google", confirm: "1", login_hint: "attacker@example.com" }),
      ),
    ).rejects.toThrow("redirect:");
    await expect(
      continueWith({}, form({ provider: "google", login_hint: "attacker@example.com" })),
    ).rejects.toThrow("redirect:");
    const [confirming, plain] = oauth.calls as { options: Record<string, unknown> }[];
    expect(confirming?.options.queryParams).toEqual({
      prompt: "select_account",
      login_hint: "someone@example.com",
    });
    expect(plain?.options.queryParams).toBeUndefined();
  });

  it("asks which account without a hint when nobody is signed in", async () => {
    const { continueWith } = await import("@/app/login/actions");
    await expect(continueWith({}, form({ provider: "google", confirm: "1" }))).rejects.toThrow(
      "redirect:",
    );
    const [call] = oauth.calls as { options: Record<string, unknown> }[];
    expect(call?.options.queryParams).toEqual({ prompt: "select_account" });
  });

  it("answers plainly when Supabase can't start it", async () => {
    const { continueWith } = await import("@/app/login/actions");
    oauth.result = { data: { url: null }, error: { message: "boom" } };
    expect((await continueWith({}, form({ provider: "apple" }))).error).toBe(
      "Couldn't start signing in. Try again.",
    );
    oauth.result = { data: { url: null }, error: null };
    expect((await continueWith({}, form({ provider: "apple" }))).error).toMatch(/Couldn't start/);
  });
});

describe("the account page, for an account without a password", () => {
  const ME = { id: OTHER, email: "someone@example.com" };
  const auth = { refreshSession: vi.fn(), signOut: vi.fn() };

  beforeEach(async () => {
    session.user = ME;
    signedIn.facts = { signInMethods: ["apple"], hasPassword: false, freshSignIn: false };
    auth.refreshSession.mockReset().mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    const account = await import("@/lib/account");
    vi.mocked(account.setPasswordFor).mockClear();
    vi.mocked(account.deleteAccountFor).mockClear();
    vi.mocked(account.changePasswordFor).mockClear();
    const server = await import("@/lib/supabase/server");
    vi.mocked(server.createClient).mockImplementation((async () => ({
      ...emptyClient(),
      auth,
    })) as never);
    vi.mocked((await import("next/cache")).revalidatePath).mockClear();
  });

  it("passes on how they signed in, so a stale sign-in can't set a password", async () => {
    const { setPassword } = await import("@/app/profile/account/actions");
    const { setPasswordFor } = await import("@/lib/account");
    expect(await setPassword({}, form({ next: "longenough" }))).toEqual({
      error: "Please confirm it's you again.",
    });
    expect(setPasswordFor).toHaveBeenCalledWith(ME, { next: "longenough" }, signedIn.facts);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    // The page draws itself again, offering "Continue with Apple" in place of the form.
    expect((await import("next/cache")).revalidatePath).toHaveBeenCalledWith("/profile/account");
  });

  it("leaves the page alone for any other refusal", async () => {
    const { setPassword } = await import("@/app/profile/account/actions");
    signedIn.facts = { signInMethods: ["apple"], hasPassword: false, freshSignIn: true };
    expect((await setPassword({}, form({ next: "abc" }))).error).toMatch(/at least 6/);
    expect((await import("next/cache")).revalidatePath).not.toHaveBeenCalled();
  });

  it("once set, refreshes the session so the page knows, and says so", async () => {
    const { setPassword } = await import("@/app/profile/account/actions");
    const { setPasswordFor } = await import("@/lib/account");
    vi.mocked(setPasswordFor).mockResolvedValueOnce({ ok: true, message: "Password set." });
    expect(await setPassword({}, form({ next: "longenough" }))).toEqual({
      message: "Password set.",
    });
    expect(auth.refreshSession).toHaveBeenCalled();
    expect((await import("next/cache")).revalidatePath).toHaveBeenCalledWith("/profile/account");
  });

  it("changing a password passes the facts on too, and is refused without one", async () => {
    const { changePassword } = await import("@/app/profile/account/actions");
    const { changePasswordFor } = await import("@/lib/account");
    expect(await changePassword({}, form({ current: "x", next: "longenough" }))).toEqual({
      error: "You don't have a password yet. Set one instead.",
    });
    expect(changePasswordFor).toHaveBeenCalledWith(
      ME,
      { current: "x", next: "longenough" },
      signedIn.facts,
    );
  });

  it("deletes with no password sent, and says goodbye with how to remove Apple's link", async () => {
    const { deleteAccount } = await import("@/app/profile/account/actions");
    const { deleteAccountFor } = await import("@/lib/account");
    vi.mocked(deleteAccountFor).mockResolvedValueOnce({
      ok: true,
      message: "Your account is gone.",
      appleLinkLeft: true,
    });
    await expect(deleteAccount({}, form({ confirm: "DELETE" }))).rejects.toThrow(
      "redirect:/?goodbye=apple",
    );
    expect(deleteAccountFor).toHaveBeenCalledWith(ME, { confirm: "DELETE" }, signedIn.facts);
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("says a plain goodbye otherwise, and still sends a typed password", async () => {
    signedIn.facts = { signInMethods: ["email"], hasPassword: true, freshSignIn: false };
    const { deleteAccount } = await import("@/app/profile/account/actions");
    const { deleteAccountFor } = await import("@/lib/account");
    vi.mocked(deleteAccountFor).mockResolvedValueOnce({
      ok: true,
      message: "Your account is gone.",
    });
    await expect(
      deleteAccount({}, form({ current: "longenough", confirm: "DELETE" })),
    ).rejects.toThrow("redirect:/?goodbye=1");
    expect(deleteAccountFor).toHaveBeenCalledWith(
      ME,
      { current: "longenough", confirm: "DELETE" },
      signedIn.facts,
    );
  });

  it("asks a stale sign-in without a password to confirm, deleting nothing", async () => {
    const { deleteAccount } = await import("@/app/profile/account/actions");
    expect(await deleteAccount({}, form({ confirm: "DELETE" }))).toEqual({
      error: "Please confirm it's you again.",
    });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect((await import("next/cache")).revalidatePath).toHaveBeenCalledWith("/profile/account");
  });
});

describe("setting a new password from a reset link", () => {
  const ME = { id: OTHER, email: "someone@example.com" };
  const auth = { updateUser: vi.fn(), refreshSession: vi.fn() };
  const details = form({ password: "longenough", confirm: "longenough" });

  beforeEach(async () => {
    session.user = ME;
    signedIn.fromResetLink = true;
    auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    auth.refreshSession.mockReset().mockResolvedValue({ data: {}, error: null });
    vi.mocked((await import("@/lib/account")).markHasPassword).mockClear();
    const server = await import("@/lib/supabase/server");
    vi.mocked(server.createClient).mockImplementation((async () => ({
      ...emptyClient(),
      auth,
    })) as never);
  });

  it("refuses a session that didn't come from a reset link, changing nothing", async () => {
    signedIn.fromResetLink = false;
    const { updatePassword } = await import("@/app/auth/update-password/actions");
    expect(await updatePassword({}, details)).toEqual({
      error: "That reset link has expired. Please request a new one.",
      expired: true,
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect((await import("@/lib/account")).markHasPassword).not.toHaveBeenCalled();
  });

  it("sets it, and marks the account as having a password", async () => {
    const { updatePassword } = await import("@/app/auth/update-password/actions");
    await expect(updatePassword({}, details)).rejects.toThrow("redirect:/");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "longenough" });
    expect((await import("@/lib/account")).markHasPassword).toHaveBeenCalledWith(ME.id);
  });

  it("marks nothing when the password couldn't be saved", async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: { message: "down" } });
    const { updatePassword } = await import("@/app/auth/update-password/actions");
    expect((await updatePassword({}, details)).error).toMatch(/Couldn't save/);
    expect((await import("@/lib/account")).markHasPassword).not.toHaveBeenCalled();
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
      "setArtistFollowing",
      async () => (await import("@/app/artist/[mbid]/actions")).setArtistFollowing(MBID, true),
    ],
    [
      "followArtists",
      async () => (await import("@/app/artist/[mbid]/actions")).followArtists([MBID]),
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
    [
      "setPassword",
      async () =>
        (await import("@/app/profile/account/actions")).setPassword(
          {},
          form({ next: "longenough" }),
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

  it("artistSuggestions answers none, touching nothing", async () => {
    const { artistSuggestions } = await import("@/app/artist/[mbid]/actions");
    expect(await artistSuggestions()).toEqual([]);
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
    [
      "an artist follow of a non-id",
      async () => (await import("@/app/artist/[mbid]/actions")).setArtistFollowing("../x", true),
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
