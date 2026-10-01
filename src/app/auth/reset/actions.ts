"use server";

import { createClient } from "@/lib/supabase/server";
import { authCallbackUrl } from "@/lib/auth";
import { allowAddress } from "@/lib/rate-limit";
import { emailSchema, field, firstError } from "@/lib/validation";

export type ResetState = { error?: string; message?: string };

export async function requestReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = emailSchema.safeParse(field(formData, "email"));
  if (!email.success) return { error: firstError(email.error) };
  if (!(await allowAddress("reset"))) {
    return { error: "Too many reset emails just now. Please wait a few minutes." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    // From Vercel's settings, never the request's Host header, which could
    // be forged to send somebody's reset link elsewhere.
    redirectTo: authCallbackUrl("/auth/update-password"),
  });

  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) {
      return {
        error: "Too many reset emails just now. Please wait a few minutes.",
      };
    }
    console.error("[auth] password reset failed:", error.message);
    return { error: "Couldn't send a reset email just now. Please try again in a minute." };
  }

  // Say the same thing either way, so this can't be used to find out which
  // email addresses have accounts.
  return {
    message:
      "If an account exists for that address, a reset link is on its way. Check your inbox.",
  };
}
