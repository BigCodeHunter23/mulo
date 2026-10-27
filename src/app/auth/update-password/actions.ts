"use server";

import { redirect } from "next/navigation";
import { markHasPassword } from "@/lib/account";
import { cameFromResetLink } from "@/lib/session-facts";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { field, firstError, newPasswordSchema } from "@/lib/validation";

export type UpdatePasswordState = {
  error?: string;
  /** No session: the link expired or was used, so a new one is needed. */
  expired?: boolean;
};

/**
 * A new password, from a reset link. Only a session the link itself made, in
 * the last few minutes, may set one here: any other session (a laptop left
 * signed in) has to change it on the account page, with the current password.
 */
export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const user = await getCurrentUser();

  if (!user || !(await cameFromResetLink())) {
    return {
      error: "That reset link has expired. Please request a new one.",
      expired: true,
    };
  }

  const password = newPasswordSchema.safeParse(field(formData, "password"));
  if (!password.success) return { error: firstError(password.error) };
  if (password.data !== field(formData, "confirm")) {
    return { error: "Those two passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("different from the old")) {
      return { error: "Pick a password you haven't used here before." };
    }
    if (m.includes("weak") || m.includes("password should")) {
      return { error: "That password is too easy to guess. Try a longer one." };
    }
    console.error("[auth] password update failed:", error.message);
    return { error: "Couldn't save your new password. Please try again." };
  }

  // An account made with Apple or Google has a password now too, so the
  // account page offers to change it. Best effort: the password is saved
  // either way, and the session is refreshed so its token says so.
  if (await markHasPassword(user.id)) {
    await supabase.auth.refreshSession().catch(() => undefined);
  }
  redirect("/");
}
