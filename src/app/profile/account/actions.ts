"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authCallbackUrl } from "@/lib/auth";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import {
  emailSchema,
  field,
  firstError,
  newPasswordSchema,
  passwordSchema,
} from "@/lib/validation";

export type AccountState = { error?: string; message?: string };

const LOGGED_OUT = "You've been logged out. Log in again to change your account.";

const passwordInput = z.object({
  current: passwordSchema,
  next: newPasswordSchema,
});

const emailInput = z.object({
  email: emailSchema,
  current: passwordSchema,
});

const deleteInput = z.object({
  current: passwordSchema,
  confirm: z.string().trim(),
});

/**
 * Checks somebody really is who the session says, by signing in again with
 * the password they just typed.
 *
 * Changing a password or an email, or deleting everything, has to survive a
 * borrowed laptop with a session left open. Supabase's own sign-in is the
 * check; it also tells us plainly when the password is wrong.
 */
async function confirmPassword(email: string, password: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  const input = passwordInput.safeParse({
    current: field(formData, "current"),
    next: field(formData, "next"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowUser("write", user.id))) return { error: TOO_MANY };

  if (!user.email) return { error: "This account has no email address to check against." };
  if (!(await confirmPassword(user.email, input.data.current))) {
    return { error: "That isn't your current password." };
  }
  if (input.data.current === input.data.next) {
    return { error: "That's the password you already have. Pick a different one." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.data.next });
  if (error) {
    console.error("[account] password change failed:", error.message);
    return { error: "Couldn't change your password. Please try again." };
  }

  return { message: "Password changed. You're still logged in here." };
}

export async function changeEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  const input = emailInput.safeParse({
    email: field(formData, "email"),
    current: field(formData, "current"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowUser("write", user.id))) return { error: TOO_MANY };

  if (!user.email) return { error: "This account has no email address to change." };
  if (input.data.email.toLowerCase() === user.email.toLowerCase()) {
    return { error: "That's the address you already use." };
  }
  if (!(await confirmPassword(user.email, input.data.current))) {
    return { error: "That isn't your current password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: input.data.email },
    { emailRedirectTo: authCallbackUrl("/profile/account") },
  );

  if (error) {
    // Supabase says plainly when an address is already in use; anything else
    // is ours to keep quiet about.
    const message = error.message.toLowerCase();
    if (message.includes("already")) {
      return { error: "That address is already in use on another account." };
    }
    console.error("[account] email change failed:", error.message);
    return { error: "Couldn't change your email. Please try again." };
  }

  return {
    message: `Check ${input.data.email} and follow the link to confirm it. Until you do, keep using your old address to log in.`,
  };
}

/**
 * Deletes the account and everything attached to it.
 *
 * Every table hangs off the person's row with `on delete cascade`, so removing
 * the account removes their ratings, reviews, lists, follows and picks with
 * it. Their avatar is a file rather than a row, so it goes separately.
 */
export async function deleteAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  const input = deleteInput.safeParse({
    current: field(formData, "current"),
    confirm: field(formData, "confirm"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowUser("write", user.id))) return { error: TOO_MANY };

  if (input.data.confirm.toUpperCase() !== "DELETE") {
    return { error: "Type DELETE in the box to confirm." };
  }
  if (!user.email) return { error: "This account has no email address to check against." };
  if (!(await confirmPassword(user.email, input.data.current))) {
    return { error: "That isn't your password." };
  }

  const admin = createAdminClient();

  // Best effort: a left-behind picture is untidy, not a reason to stop.
  for (const extension of ["jpg", "png", "webp"]) {
    await admin.storage.from("avatars").remove([`${user.id}/avatar.${extension}`]);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete failed:", error.message);
    return { error: "Couldn't delete your account. Please try again, or get in touch." };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?goodbye=1");
}
