"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UpdatePasswordState = { error?: string };

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching here without a session means the reset link expired or was
  // already used.
  if (!user) {
    return {
      error: "That reset link has expired. Please request a new one.",
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

  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect("/?password=updated");
}
