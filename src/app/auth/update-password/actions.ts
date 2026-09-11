"use server";

import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    return { error: "Your password needs to be at least 6 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect("/");
}
