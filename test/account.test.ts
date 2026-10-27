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

const admin = vi.hoisted(() => ({ remove: vi.fn(), deleteUser: vi.fn() }));
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
    auth: { admin: { deleteUser: admin.deleteUser } },
  })),
}));
vi.mock("@/lib/env", () => ({
  supabaseUrl: () => "https://x.supabase.co",
  supabaseAnonKey: () => "k",
}));
vi.mock("@/lib/auth", () => ({
  authCallbackUrl: (next: string) => `https://mulo.test/cb?next=${next}`,
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowUser: vi.fn(async () => !limits.limited),
}));

const { changeEmailFor, changePasswordFor, deleteAccountFor } = await import("@/lib/account");
const { createClient } = await import("@supabase/supabase-js");

const ME = { id: "1f9df192-a621-4f54-8850-2c5373b7eac9", email: "me@example.com" };

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
});

describe("changePasswordFor", () => {
  it("checks the password on a client of its own, changes it there, then ends that session", async () => {
    const result = await changePasswordFor(ME, { current: "right-password", next: "brand-new" });
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
    expect(await changePasswordFor(ME, { current: "wrong", next: "brand-new" })).toEqual({
      ok: false,
      error: "That isn't your current password.",
    });
    expect(fresh.updateUser).not.toHaveBeenCalled();
  });

  it("won't swap a password for itself", async () => {
    const result = await changePasswordFor(ME, {
      current: "right-password",
      next: "right-password",
    });
    expect(result).toEqual({
      ok: false,
      error: "That's the password you already have. Pick a different one.",
    });
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("refuses a short new password in the website's words, before checking anything", async () => {
    const result = await changePasswordFor(ME, { current: "right-password", next: "abc" });
    expect(result.ok).toBe(false);
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("is limited like every other change", async () => {
    limits.limited = true;
    expect(await changePasswordFor(ME, { current: "right-password", next: "brand-new" })).toEqual({
      ok: false,
      error: "You're doing that a lot. Please wait a minute and try again.",
    });
  });
});

describe("changeEmailFor", () => {
  it("sends the confirmation link to the new address", async () => {
    const result = await changeEmailFor(ME, {
      email: "new@example.com",
      current: "right-password",
    });
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

  it("says when it's the address already in use", async () => {
    expect(
      await changeEmailFor(ME, { email: "ME@example.com", current: "right-password" }),
    ).toEqual({
      ok: false,
      error: "That's the address you already use.",
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
  });

  it("says when another account has it", async () => {
    fresh.updateUser.mockResolvedValue({ error: { message: "Email address already registered" } });
    expect(
      await changeEmailFor(ME, { email: "new@example.com", current: "right-password" }),
    ).toEqual({
      ok: false,
      error: "That address is already in use on another account.",
    });
  });
});

describe("deleteAccountFor", () => {
  it("removes the photo and the account, taking everything else with it", async () => {
    expect(await deleteAccountFor(ME, { current: "right-password", confirm: "delete" })).toEqual({
      ok: true,
      message: "Your account is gone.",
    });
    expect(admin.remove).toHaveBeenCalledTimes(3);
    expect(admin.remove).toHaveBeenCalledWith([`${ME.id}/avatar.jpg`]);
    expect(admin.deleteUser).toHaveBeenCalledWith(ME.id);
    expect(fresh.signOut).toHaveBeenCalled();
  });

  it("needs DELETE typed, before the password is even checked", async () => {
    expect(await deleteAccountFor(ME, { current: "right-password", confirm: "nope" })).toEqual({
      ok: false,
      error: "Type DELETE in the box to confirm.",
    });
    expect(fresh.signInWithPassword).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("says when the password is wrong, and deletes nothing", async () => {
    expect(await deleteAccountFor(ME, { current: "wrong", confirm: "DELETE" })).toEqual({
      ok: false,
      error: "That isn't your password.",
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("says when the delete itself fails", async () => {
    admin.deleteUser.mockResolvedValue({ error: { message: "down" } });
    expect(await deleteAccountFor(ME, { current: "right-password", confirm: "DELETE" })).toEqual({
      ok: false,
      error: "Couldn't delete your account. Please try again, or get in touch.",
    });
  });

  it("can't check an account with no email", async () => {
    expect(
      await deleteAccountFor({ id: ME.id, email: null }, { current: "x", confirm: "DELETE" }),
    ).toEqual({ ok: false, error: "This account has no email address to check against." });
  });
});
