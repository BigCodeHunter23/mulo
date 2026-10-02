"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authCallbackUrl } from "@/lib/auth";
import { consumeInviteCookie } from "@/lib/invites";
import { safeRedirectPath } from "@/lib/redirects";
import { allowAddress } from "@/lib/rate-limit";
import {
  emailSchema,
  field,
  firstError,
  newPasswordSchema,
  passwordSchema,
} from "@/lib/validation";

export type AuthState = { error?: string; message?: string };

/** Where a new account goes first: it needs a username before anything else works. */
const AFTER_SIGNUP = "/welcome?intro=1";

const TOO_MANY_ATTEMPTS = "Too many attempts just now. Please wait a few minutes and try again.";

const loginInput = z.object({ email: emailSchema, password: passwordSchema });
const signupInput = z.object({ email: emailSchema, password: newPasswordSchema });

/** Supabase's raw messages are terse and jargon-y; say something useful. */
function friendlyError(message: string) {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email and password combination doesn't match an account.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address first — check your inbox for the link.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts just now. Please wait a few minutes and try again.";
  }
  if (m.includes("password should be")) {
    return "Your password needs to be at least 6 characters.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "That doesn't look like a valid email address.";
  }
  // Anything else is Supabase talking to developers, not to people.
  console.error("[auth] unexpected Supabase error:", message);
  return "Something went wrong on our side. Please try again in a minute.";
}

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

export async function logout() {
  const supabase = await createClient();
  // This device only: logging out on a phone shouldn't end the laptop's session.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
