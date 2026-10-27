"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authCallbackUrl } from "@/lib/auth";
import { consumeInviteCookie } from "@/lib/invites";
import { safeRedirectPath } from "@/lib/redirects";
import { allowAddress } from "@/lib/rate-limit";
import { OAUTH_PROVIDERS, PROVIDER_OFF } from "@/lib/oauth";
import { field, firstError } from "@/lib/validation";
import {
  AFTER_SIGNUP,
  friendlyError,
  loginInput,
  signupInput,
  TOO_MANY_ATTEMPTS,
} from "@/lib/auth-input";

export type AuthState = { error?: string; message?: string };

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const input = loginInput.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowAddress("login"))) return { error: TOO_MANY_ATTEMPTS };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) return { error: friendlyError(error.message) };

  // Back to wherever they were when they were asked to log in.
  redirect(safeRedirectPath(field(formData, "next")) ?? "/");
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const input = signupInput.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowAddress("signup"))) return { error: TOO_MANY_ATTEMPTS };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...input.data,
    // The confirmation email links back here, which finishes signing in and
    // carries on to the welcome steps. Without it the link went to the bare
    // site address, where nothing completed the sign-in.
    options: { emailRedirectTo: authCallbackUrl(AFTER_SIGNUP) },
  });

  if (error) return { error: friendlyError(error.message) };

  // When email confirmation is switched off, Supabase signs the user straight
  // in and returns a session. Otherwise they need to click the emailed link,
  // and /auth/confirm does the rest.
  if (data.session && data.user) {
    await consumeInviteCookie(data.user.id);
    redirect(AFTER_SIGNUP);
  }

  return {
    message: "Account created. Check your email for a confirmation link.",
  };
}

const providerInput = z.enum(OAUTH_PROVIDERS);

/**
 * "Continue with Apple" or "Continue with Google": sends the browser to the
 * provider, which returns through /auth/confirm to finish signing in. The
 * button's own `provider` value says which; `next` is where to land after.
 */
export async function continueWith(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const provider = providerInput.safeParse(field(formData, "provider"));
  if (!provider.success) return { error: PROVIDER_OFF };
  if (!(await allowAddress("login"))) return { error: TOO_MANY_ATTEMPTS };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.data,
    options: {
      redirectTo: authCallbackUrl(safeRedirectPath(field(formData, "next")) ?? "/"),
      ...(provider.data === "apple" ? { scopes: "name email" } : {}),
    },
  });
  if (error || !data.url) return { error: "Couldn't start signing in. Try again." };

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  // This device only: logging out on a phone shouldn't end the laptop's session.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
