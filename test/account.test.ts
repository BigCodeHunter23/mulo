import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Changing how somebody logs in, or deleting them (`src/lib/account.ts`),
 * which the website's account page and the app share. The password is
 * checked on a fresh client of its own, so the caller's session is never
 * touched; Supabase is a stand-in.
 */

const fresh = vi.hoisted(() => ({
  password: "right-password",
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

const admin = vi.hoisted(() => ({
  remove: vi.fn(),
  deleteUser: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}));
const apple = vi.hoisted(() => ({ forgetAppleLink: vi.fn() }));
/** The caller's own client: a browser's has a session, the app's token client none. */
const own = vi.hoisted(() => ({ session: null as object | null, updateUser: vi.fn() }));
const limits = vi.hoisted(() => ({ limited: false }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: fresh.signInWithPassword,
      updateUser: fresh.updateUser,
      signOut: fresh.signOut,
    },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: () => ({ remove: admin.remove }) },
    auth: {
      admin: {
        deleteUser: admin.deleteUser,
        getUserById: admin.getUserById,
        updateUserById: admin.updateUserById,
      },
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: async () => ({ data: { session: own.session } }),
      updateUser: own.updateUser,
    },
  })),
}));
vi.mock("@/lib/env", () => ({
  supabaseUrl: () => "https://x.supabase.co",
  supabaseAnonKey: () => "k",
}));
vi.mock("@/lib/auth", () => ({
  authCallbackUrl: (next: string) => `https://mulo.test/cb?next=${next}`,
}));
vi.mock("@/lib/apple-tokens", () => ({ forgetAppleLink: apple.forgetAppleLink }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowUser: vi.fn(async () => !limits.limited),
}));

const { changeEmailFor, changePasswordFor, deleteAccountFor, markHasPassword, setPasswordFor } =
  await import("@/lib/account");
const { createClient } = await import("@supabase/supabase-js");
const { allowUser } = await import("@/lib/rate-limit");

const ME = { id: "1f9df192-a621-4f54-8850-2c5373b7eac9", email: "me@example.com" };

type Facts = import("@/lib/session-facts").SessionFacts;

/** How the caller signed in: an email account, unless a test says otherwise. */
const facts = (overrides: Partial<Facts> = {}): Facts => ({
  signInMethods: ["email"],
  hasPassword: true,
  freshSignIn: false,
  ...overrides,
});
const EMAIL = facts();
/** An account made with Apple, signed in again just now, or long ago. */
const APPLE_FRESH = facts({ signInMethods: ["apple"], hasPassword: false, freshSignIn: true });
const APPLE_STALE = facts({ signInMethods: ["apple"], hasPassword: false, freshSignIn: false });
const APPLE_META = { provider: "apple", providers: ["apple"] };

beforeEach(() => {
  limits.limited = false;
  vi.mocked(createClient).mockClear();
  fresh.signInWithPassword
    .mockReset()
    .mockImplementation(async ({ password }: { password: string }) => ({
      error: password === fresh.password ? null : { message: "Invalid login credentials" },
    }));
  fresh.updateUser.mockReset().mockResolvedValue({ error: null });
  fresh.signOut.mockReset().mockResolvedValue({ error: null });
  admin.remove.mockReset().mockResolvedValue({ error: null });
  admin.deleteUser.mockReset().mockResolvedValue({ error: null });
  admin.getUserById
    .mockReset()
    .mockResolvedValue({ data: { user: { id: ME.id, app_metadata: APPLE_META } }, error: null });
  admin.updateUserById.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  apple.forgetAppleLink.mockReset().mockResolvedValue(true);
  own.session = null;
  own.updateUser.mockReset().mockResolvedValue({ error: null });
  vi.mocked(allowUser).mockClear();
});

describe("changePasswordFor", () => {
  it("checks the password on a client of its own, changes it there, then ends that session", async () => {
    const result = await changePasswordFor(
      ME,
      { current: "right-password", next: "brand-new" },
      EMAIL,
    );
    expect(result).toEqual({ ok: true, message: "Password changed. You're still logged in here." });
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "k",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
    expect(fresh.signInWithPassword).toHaveBeenCalledWith({
      email: ME.email,
      password: "right-password",
    });
    expect(fresh.updateUser).toHaveBeenCalledWith({ password: "brand-new" });
    expect(fresh.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("says when the current password is wrong, and changes nothing", async () => {
    expect(await changePasswordFor(ME, { current: "wrong", next: "brand-new" }, EMAIL)).toEqual({
      ok: false,
      error: "That isn't your current password.",
    });
    expect(fresh.updateUser).not.toHaveBeenCalled();
  });

  it("won't swap a password for itself", async () => {
    const result = await changePasswordFor(
      ME,
      {
        current: "right-password",
        next: "right-password",
      },
      EMAIL,
    );
    expect(result).toEqual({
      ok: false,
      error: "That's the password you already have. Pick a different one.",
    });
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("refuses a short new password in the website's words, before checking anything", async () => {
    const result = await changePasswordFor(ME, { current: "right-password", next: "abc" }, EMAIL);
    expect(result.ok).toBe(false);
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("counts against the tight password limit as well as the usual one", async () => {
    await changePasswordFor(ME, { current: "right-password", next: "brand-new" }, EMAIL);
    expect(allowUser).toHaveBeenCalledWith("password", ME.id);
    expect(allowUser).toHaveBeenCalledWith("write", ME.id);
  });

  it("is limited like every other change", async () => {
    limits.limited = true;
    expect(
      await changePasswordFor(ME, { current: "right-password", next: "brand-new" }, EMAIL),
    ).toEqual({
      ok: false,
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
  });
});

describe("changePasswordFor, for an account without a password", () => {
  it("points to setting one instead, checking nothing", async () => {
    expect(
      await changePasswordFor(ME, { current: "anything", next: "brand-new" }, APPLE_FRESH),
    ).toEqual({ ok: false, error: "You don't have a password yet. Set one instead." });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
    expect(fresh.updateUser).not.toHaveBeenCalled();
  });
});

describe("changeEmailFor", () => {
  it("sends the confirmation link to the new address", async () => {
    const result = await changeEmailFor(
      ME,
      {
        email: "new@example.com",
        current: "right-password",
      },
      EMAIL,
    );
    expect(result).toEqual({
      ok: true,
      message:
        "Check new@example.com and follow the link to confirm it. Until you do, keep using your old address to log in.",
    });
    expect(fresh.updateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: "https://mulo.test/cb?next=/profile/account" },
    );
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("asks from the browser's own session, so the link logs straight in there", async () => {
    own.session = { access_token: "cookie" };
    await changeEmailFor(ME, { email: "new@example.com", current: "right-password" }, EMAIL);
    expect(own.updateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: "https://mulo.test/cb?next=/profile/account" },
    );
    expect(fresh.updateUser).not.toHaveBeenCalled();
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("says when it's the address already in use", async () => {
    expect(
      await changeEmailFor(ME, { email: "ME@example.com", current: "right-password" }, EMAIL),
    ).toEqual({
      ok: false,
      error: "That's the address you already use.",
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("says when another account has it", async () => {
    fresh.updateUser.mockResolvedValue({ error: { message: "Email address already registered" } });
    expect(
      await changeEmailFor(ME, { email: "new@example.com", current: "right-password" }, EMAIL),
    ).toEqual({
      ok: false,
      error: "That address is already in use on another account.",
    });
  });

  it("needs a password set first on an account without one", async () => {
    expect(await changeEmailFor(ME, { email: "new@example.com" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "Set a password first, then you can change your email.",
    });
    expect(fresh.updateUser).not.toHaveBeenCalled();
    expect(own.updateUser).not.toHaveBeenCalled();
  });
});

describe("deleteAccountFor", () => {
  it("removes the photo and the account, taking everything else with it", async () => {
    expect(
      await deleteAccountFor(ME, { current: "right-password", confirm: "delete" }, EMAIL),
    ).toEqual({
      ok: true,
      message: "Your account is gone.",
    });
    expect(admin.remove).toHaveBeenCalledTimes(3);
    // The account first, so a failed delete never leaves it without its picture.
    expect(admin.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      admin.remove.mock.invocationCallOrder[0] ?? 0,
    );
    expect(admin.remove).toHaveBeenCalledWith([`${ME.id}/avatar.jpg`]);
    expect(admin.deleteUser).toHaveBeenCalledWith(ME.id);
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("needs DELETE typed, before the password is even checked", async () => {
    expect(
      await deleteAccountFor(ME, { current: "right-password", confirm: "nope" }, EMAIL),
    ).toEqual({
      ok: false,
      error: "Type DELETE in the box to confirm.",
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("says when the password is wrong, and deletes nothing", async () => {
    expect(await deleteAccountFor(ME, { current: "wrong", confirm: "DELETE" }, EMAIL)).toEqual({
      ok: false,
      error: "That isn't your password.",
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("still says it's gone when a picture won't go", async () => {
    admin.remove.mockRejectedValue(new Error("storage down"));
    expect(
      (await deleteAccountFor(ME, { current: "right-password", confirm: "DELETE" }, EMAIL)).ok,
    ).toBe(true);
  });

  it("says when the delete itself fails, leaving the picture", async () => {
    admin.deleteUser.mockResolvedValue({ error: { message: "down" } });
    expect(
      await deleteAccountFor(ME, { current: "right-password", confirm: "DELETE" }, EMAIL),
    ).toEqual({
      ok: false,
      error: "Couldn't delete your account. Please try again, or get in touch.",
    });
    expect(admin.remove).not.toHaveBeenCalled();
  });

  it("can't check an account with no email", async () => {
    expect(
      await deleteAccountFor(
        { id: ME.id, email: null },
        { current: "x", confirm: "DELETE" },
        EMAIL,
      ),
    ).toEqual({ ok: false, error: "This account has no email address to check against." });
  });
});

describe("deleteAccountFor, cancelling the Apple link", () => {
  it("cancels the link before deleting, with a password too", async () => {
    await deleteAccountFor(ME, { current: "right-password", confirm: "DELETE" }, EMAIL);
    expect(apple.forgetAppleLink).toHaveBeenCalledWith(ME.id);
    // Before: the stored token goes with the account.
    expect(apple.forgetAppleLink.mock.invocationCallOrder[0]).toBeLessThan(
      admin.deleteUser.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("still asks for the password on an account with one", async () => {
    expect(await deleteAccountFor(ME, { confirm: "DELETE" }, EMAIL)).toEqual({
      ok: false,
      error: "Enter your password.",
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(apple.forgetAppleLink).not.toHaveBeenCalled();
  });

  it("doesn't cancel anything when the password is wrong", async () => {
    await deleteAccountFor(ME, { current: "wrong", confirm: "DELETE" }, EMAIL);
    expect(apple.forgetAppleLink).not.toHaveBeenCalled();
  });

  it("deletes an account without a password after a fresh sign-in", async () => {
    expect(await deleteAccountFor(ME, { confirm: "DELETE" }, APPLE_FRESH)).toEqual({
      ok: true,
      message: "Your account is gone.",
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
    expect(apple.forgetAppleLink).toHaveBeenCalledWith(ME.id);
    expect(apple.forgetAppleLink.mock.invocationCallOrder[0]).toBeLessThan(
      admin.deleteUser.mock.invocationCallOrder[0] ?? 0,
    );
    expect(admin.deleteUser).toHaveBeenCalledWith(ME.id);
  });

  it("ignores a password sent for an account without one", async () => {
    const result = await deleteAccountFor(ME, { current: "", confirm: "DELETE" }, APPLE_FRESH);
    expect(result.ok).toBe(true);
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("asks somebody without a password to sign in again when it's been a while", async () => {
    expect(await deleteAccountFor(ME, { confirm: "DELETE" }, APPLE_STALE)).toEqual({
      ok: false,
      error: "Please confirm it's you again.",
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(apple.forgetAppleLink).not.toHaveBeenCalled();
  });

  it("still needs DELETE typed without a password", async () => {
    expect(await deleteAccountFor(ME, { confirm: "nope" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "Type DELETE in the box to confirm.",
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes anyway when Apple can't be told, and says the link is left", async () => {
    apple.forgetAppleLink.mockResolvedValue(false);
    expect(await deleteAccountFor(ME, { confirm: "DELETE" }, APPLE_FRESH)).toEqual({
      ok: true,
      message: "Your account is gone.",
      appleLinkLeft: true,
    });
    expect(admin.deleteUser).toHaveBeenCalledWith(ME.id);
  });

  it("raises no alarm for an account that never signed in with Apple", async () => {
    apple.forgetAppleLink.mockResolvedValue(false);
    const google = facts({ signInMethods: ["google"], hasPassword: false, freshSignIn: true });
    expect(await deleteAccountFor(ME, { confirm: "DELETE" }, google)).toEqual({
      ok: true,
      message: "Your account is gone.",
    });
  });

  it("is limited like every other change", async () => {
    limits.limited = true;
    expect((await deleteAccountFor(ME, { confirm: "DELETE" }, APPLE_FRESH)).ok).toBe(false);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe("setPasswordFor", () => {
  it("sets a password for an account without one, sending only the key Supabase merges in", async () => {
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: true,
      message: "Password set. You can now log in with your email too.",
    });
    expect(admin.getUserById).toHaveBeenCalledWith(ME.id);
    expect(admin.updateUserById).toHaveBeenCalledWith(ME.id, {
      password: "brand-new",
      app_metadata: { has_password: true },
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("checks the account itself, so a token from before a password was set can't replace it", async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: { id: ME.id, app_metadata: { ...APPLE_META, has_password: true } } },
      error: null,
    });
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "You already have a password. Change it instead.",
    });

    admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: ME.id,
          app_metadata: APPLE_META,
          identities: [{ provider: "apple" }, { provider: "email" }],
        },
      },
      error: null,
    });
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "You already have a password. Change it instead.",
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("points to changing it when there's one already", async () => {
    expect(await setPasswordFor(ME, { next: "brand-new" }, EMAIL)).toEqual({
      ok: false,
      error: "You already have a password. Change it instead.",
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in when it's been a while", async () => {
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_STALE)).toEqual({
      ok: false,
      error: "Please confirm it's you again.",
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a short password in the website's words", async () => {
    expect(await setPasswordFor(ME, { next: "abc" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "Your password needs to be at least 6 characters.",
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("is limited like every other change", async () => {
    limits.limited = true;
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
    expect(allowUser).toHaveBeenCalledWith("password", ME.id);
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("answers plainly when the account can't be read or saved", async () => {
    admin.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "down" } });
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "Couldn't set your password. Please try again.",
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();

    admin.getUserById.mockResolvedValue({
      data: { user: { id: ME.id, app_metadata: {} } },
      error: null,
    });
    admin.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "down" } });
    expect(await setPasswordFor(ME, { next: "brand-new" }, APPLE_FRESH)).toEqual({
      ok: false,
      error: "Couldn't set your password. Please try again.",
    });
  });
});

describe("markHasPassword", () => {
  it("marks the account as having a password, giving only that key for Supabase to merge in", async () => {
    expect(await markHasPassword(ME.id)).toBe(true);
    expect(admin.updateUserById).toHaveBeenCalledWith(ME.id, {
      app_metadata: { has_password: true },
    });
  });

  it("says so when it couldn't", async () => {
    admin.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "down" } });
    expect(await markHasPassword(ME.id)).toBe(false);
  });
});
