"use server";

import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { field, firstError, newPasswordSchema } from "@/lib/validation";

export type UpdatePasswordState = {
  error?: string;
  /** No session: the link expired or was used, so a new one is needed. */
  expired?: boolean;
};

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const user = await getCurrentUser();

  if (!user) {
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

  redirect("/");
}
