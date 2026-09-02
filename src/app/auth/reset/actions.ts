"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error?: string; message?: string };

export async function requestReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) return { error: "Enter the email address on your account." };

  const origin = (await headers()).get("origin");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/auth/update-password`,
  });

  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) {
      return {
        error: "Too many reset emails just now. Please wait a few minutes.",
      };
    }
    return { error: error.message };
  }

  // Say the same thing either way, so this can't be used to find out which
  // email addresses have accounts.
  return {
    message:
      "If an account exists for that address, a reset link is on its way. Check your inbox.",
  };
}
