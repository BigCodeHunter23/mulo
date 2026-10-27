import "server-only";
import { createClient as createFreshClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authCallbackUrl } from "@/lib/auth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient, type CurrentUser } from "@/lib/supabase/server";
import { emailSchema, firstError, newPasswordSchema, passwordSchema } from "@/lib/validation";

/**
 * Changing how somebody logs in, or deleting them, for the website's account
 * page and the app alike.
 *
 * Each has to survive a borrowed laptop or phone with a session left open,
 * so each checks the password first, by signing in again on a client of its
 * own. The caller's session (a cookie, or the app's token) is never touched,
 * and the session the check makes is ended as soon as it's done its job.
 */

export type AccountOutcome = { ok: true; message: string } | { ok: false; error: string };

const NO_EMAIL = "This account has no email address to check against.";

const passwordInput = z.object({ current: passwordSchema, next: newPasswordSchema });
const emailInput = z.object({ email: emailSchema, current: passwordSchema });
const deleteInput = z.object({ current: passwordSchema, confirm: z.string().trim() });

type Fresh = ReturnType<typeof createFreshClient<Database>>;

/**
 * A client signed in with this password, or null when it's wrong. Each try
 * counts against the tight `password` limit as well as the usual one.
 */
async function checkPassword(email: string, password: string): Promise<Fresh | null> {
  const fresh = createFreshClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await fresh.auth.signInWithPassword({ email, password });
  return error ? null : fresh;
}

/** Both limits: the usual one for changes, and the tight one for password checks. */
async function allowed(user: CurrentUser): Promise<boolean> {
  const [write, password] = await Promise.all([
    allowUser("write", user.id),
    allowUser("password", user.id),
  ]);
  return write && password;
}

/** Ends the session a check made. Losing it is untidy, not a failure. */
async function done(fresh: Fresh): Promise<void> {
  await fresh.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export async function changePasswordFor(user: CurrentUser, raw: unknown): Promise<AccountOutcome> {
  const input = passwordInput.safeParse(raw);
  if (!input.success) return { ok: false, error: firstError(input.error) };
  if (!(await allowed(user))) return { ok: false, error: TOO_MANY };
  if (!user.email) return { ok: false, error: NO_EMAIL };

  const fresh = await checkPassword(user.email, input.data.current);
  if (!fresh) return { ok: false, error: "That isn't your current password." };
  if (input.data.current === input.data.next) {
    await done(fresh);
    return { ok: false, error: "That's the password you already have. Pick a different one." };
  }

  const { error } = await fresh.auth.updateUser({ password: input.data.next });
  await done(fresh);
  if (error) {
    console.error("[account] password change failed:", error.message);
    return { ok: false, error: "Couldn't change your password. Please try again." };
  }
  return { ok: true, message: "Password changed. You're still logged in here." };
}

export async function changeEmailFor(user: CurrentUser, raw: unknown): Promise<AccountOutcome> {
  const input = emailInput.safeParse(raw);
  if (!input.success) return { ok: false, error: firstError(input.error) };
  if (!(await allowed(user))) return { ok: false, error: TOO_MANY };

  if (!user.email) return { ok: false, error: "This account has no email address to change." };
  if (input.data.email.toLowerCase() === user.email.toLowerCase()) {
    return { ok: false, error: "That's the address you already use." };
  }
  const fresh = await checkPassword(user.email, input.data.current);
  if (!fresh) return { ok: false, error: "That isn't your current password." };

  // The website asks from its own session, which keeps the link's sign-in
  // code in this browser, so following it logs straight in as before. The app
  // has no such session (its token client holds none), so it asks from the
  // checked one; the change is confirmed either way when the link is followed.
  const own = await createClient();
  const { data } = await own.auth.getSession();
  const asker = data.session ? own : fresh;
  const { error } = await asker.auth.updateUser(
    { email: input.data.email },
    { emailRedirectTo: authCallbackUrl("/profile/account") },
  );
  await done(fresh);

  if (error) {
    // Supabase says plainly when an address is already in use; anything else
    // is ours to keep quiet about.
    if (error.message.toLowerCase().includes("already")) {
      return { ok: false, error: "That address is already in use on another account." };
    }
    console.error("[account] email change failed:", error.message);
    return { ok: false, error: "Couldn't change your email. Please try again." };
  }

  return {
    ok: true,
    message: `Check ${input.data.email} and follow the link to confirm it. Until you do, keep using your old address to log in.`,
  };
}

/**
 * Deletes the account and everything attached to it.
 *
 * Every table hangs off the person's row with `on delete cascade`, so removing
 * the account removes their ratings, reviews, lists, follows and picks with
 * it. Their avatar is a file rather than a row, so it goes separately. The
 * caller signs their own session out afterwards.
 */
export async function deleteAccountFor(user: CurrentUser, raw: unknown): Promise<AccountOutcome> {
  const input = deleteInput.safeParse(raw);
  if (!input.success) return { ok: false, error: firstError(input.error) };
  if (!(await allowed(user))) return { ok: false, error: TOO_MANY };

  if (input.data.confirm.toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE in the box to confirm." };
  }
  if (!user.email) return { ok: false, error: NO_EMAIL };
  const fresh = await checkPassword(user.email, input.data.current);
  if (!fresh) return { ok: false, error: "That isn't your password." };
  await done(fresh);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete failed:", error.message);
    return { ok: false, error: "Couldn't delete your account. Please try again, or get in touch." };
  }

  // The picture goes after the account, so a failed delete never leaves a
  // live account without its picture. Best effort: a left-behind file is
  // untidy, not a reason to say the account wasn't deleted.
  for (const extension of ["jpg", "png", "webp"]) {
    await admin.storage
      .from("avatars")
      .remove([`${user.id}/avatar.${extension}`])
      .catch(() => undefined);
  }
  return { ok: true, message: "Your account is gone." };
}
