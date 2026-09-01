"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

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
  return message;
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  redirect("/");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  // When email confirmation is switched off, Supabase signs the user straight
  // in and returns a session. Otherwise they need to click the emailed link.
  if (data.session) {
    redirect("/profile");
  }

  return {
    message:
      "Account created. Check your email for a confirmation link, then log in.",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
