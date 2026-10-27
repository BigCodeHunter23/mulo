import "server-only";
import { createClient as createFreshClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forgetAppleLink } from "@/lib/apple-tokens";
import { authCallbackUrl } from "@/lib/auth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import type { SessionFacts } from "@/lib/session-facts";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient, type CurrentUser } from "@/lib/supabase/server";
import { emailSchema, firstError, newPasswordSchema, passwordSchema } from "@/lib/validation";

/**
 * Changing how somebody logs in, or deleting them, for the website's account
 * page and the app alike.
 *
 * Each has to survive a borrowed laptop or phone with a session left open.
 * An account with a password proves it's them with that password, checked by
 * signing in again on a client of its own: the caller's session (a cookie, or
 * the app's token) is never touched, and the session the check makes is ended
 * as soon as it's done its job. An account made with Apple or Google has no
 * password, so it proves it's them by having signed in within the last few
 * minutes, which the caller's `SessionFacts` say (read from the verified
 * token on the server, never from anything the client sends).
 */

export type AccountOutcome =
  | {
      ok: true;
      message: string;
      /** Deleting only: Apple couldn't be told, so the Sign in with Apple link is still there. */
      appleLinkLeft?: true;
    }
  | { ok: false; error: string };

const NO_EMAIL = "This account has no email address to check against.";
const NOT_FRESH = "Please confirm it's you again.";
const HAS_PASSWORD = "You already have a password. Change it instead.";

const passwordInput = z.object({ current: passwordSchema, next: newPasswordSchema });
const emailInput = z.object({ email: emailSchema, current: passwordSchema });
const setPasswordInput = z.object({ next: newPasswordSchema });
/** `current` is checked only for an account with a password; one without has none to send. */
const deleteInput = z.object({ current: z.string().optional(), confirm: z.string().trim() });

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

export async function changePasswordFor(
  user: CurrentUser,
  raw: unknown,
  facts: SessionFacts,
): Promise<AccountOutcome> {
  if (!facts.hasPassword) {
    return { ok: false, error: "You don't have a password yet. Set one instead." };
  }
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

/**
 * A first password, for an account made with Apple or Google, so it can log
 * in with its email too. With no password to check, the caller must have
 * signed in just now. Set through the service role, which alone can mark the
 * account as having one (`app_metadata.has_password`, which `SessionFacts`
 * reads; Supabase merges that key into the rest, as in `markHasPassword`).
 *
 * The token's facts can be up to an hour old, so the account itself is read
 * first: one that has a password by now (set on another device, or through a
 * reset link) is refused, so this can never replace a password unchecked.
 */
export async function setPasswordFor(
  user: CurrentUser,
  raw: unknown,
  facts: SessionFacts,
): Promise<AccountOutcome> {
  if (facts.hasPassword) return { ok: false, error: HAS_PASSWORD };
  const input = setPasswordInput.safeParse(raw);
  if (!input.success) return { ok: false, error: firstError(input.error) };
  if (!(await allowed(user))) return { ok: false, error: TOO_MANY };
  if (!facts.freshSignIn) return { ok: false, error: NOT_FRESH };

  const failed = { ok: false, error: "Couldn't set your password. Please try again." } as const;
  const admin = createAdminClient();
  const { data, error: readError } = await admin.auth.admin.getUserById(user.id);
  if (readError || !data.user) {
    console.error("[account] couldn't read the account to set a password:", readError?.message);
    return failed;
  }
  const hasOne =
    data.user.app_metadata.has_password === true ||
    (data.user.identities ?? []).some((identity) => identity.provider === "email");
  if (hasOne) return { ok: false, error: HAS_PASSWORD };

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: input.data.next,
    app_metadata: { has_password: true },
  });
  if (error) {
    console.error("[account] setting a password failed:", error.message);
    return failed;
  }
  return { ok: true, message: "Password set. You can now log in with your email too." };
}

/**
 * Marks the account as having a password (`app_metadata.has_password`, which
 * `SessionFacts` reads), for one set through a reset link rather than here.
 * Only this key is sent: Supabase merges the keys it's given into
 * `app_metadata` (`UpdateAppMetaData` in its auth server), so nothing else the
 * account's metadata says is lost. True once it's saved.
 */
export async function markHasPassword(userId: string): Promise<boolean> {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    app_metadata: { has_password: true },
  });
  if (error) {
    console.error("[account] couldn't mark the account as having a password:", error.message);
    return false;
  }
  return true;
}

export async function changeEmailFor(
  user: CurrentUser,
  raw: unknown,
  facts: SessionFacts,
): Promise<AccountOutcome> {
  // The address came from Apple or Google, and there's no password to prove
  // it's them; setting one first opens this up.
  if (!facts.hasPassword) {
    return { ok: false, error: "Set a password first, then you can change your email." };
  }
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
 * Whether it's really them: the password for an account with one, a sign-in
 * in the last few minutes for one without. Null when it is, else what to say.
 */
async function provenFor(
  user: CurrentUser,
  current: string | undefined,
  facts: SessionFacts,
): Promise<string | null> {
  if (!facts.hasPassword) return facts.freshSignIn ? null : NOT_FRESH;

  const password = passwordSchema.safeParse(current ?? "");
  if (!password.success) return firstError(password.error);
  if (!user.email) return NO_EMAIL;
  const fresh = await checkPassword(user.email, password.data);
  if (!fresh) return "That isn't your password.";
  await done(fresh);
  return null;
}

/**
 * Deletes the account and everything attached to it.
 *
 * Every table hangs off the person's row with `on delete cascade`, so removing
 * the account removes their ratings, reviews, lists, follows and picks with
 * it. Their avatar is a file rather than a row, so it goes separately. The
 * Sign in with Apple link is cancelled first, as Apple asks, while the token
 * that does it is still stored (it goes with the account). The caller signs
 * their own session out afterwards.
 */
export async function deleteAccountFor(
  user: CurrentUser,
  raw: unknown,
  facts: SessionFacts,
): Promise<AccountOutcome> {
  const input = deleteInput.safeParse(raw);
  if (!input.success) return { ok: false, error: firstError(input.error) };
  if (!(await allowed(user))) return { ok: false, error: TOO_MANY };

  if (input.data.confirm.toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE in the box to confirm." };
  }
  const refused = await provenFor(user, input.data.current, facts);
  if (refused) return { ok: false, error: refused };

  // Never throws. A link Apple couldn't be told about doesn't stop the delete;
  // the person is told how to remove it themselves.
  const appleGone = await forgetAppleLink(user.id);

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
  // Only an account that signs in with Apple can have a link left. Checked
  // here because forgetAppleLink also answers false before the token table
  // exists, which mustn't alarm everybody else.
  const appleLinkLeft = !appleGone && facts.signInMethods.includes("apple");
  return {
    ok: true,
    message: "Your account is gone.",
    ...(appleLinkLeft ? { appleLinkLeft: true as const } : {}),
  };
}
