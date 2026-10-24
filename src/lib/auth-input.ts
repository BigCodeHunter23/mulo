import { z } from "zod";
import { emailSchema, newPasswordSchema, passwordSchema } from "@/lib/validation";

/**
 * What logging in and signing up accept, and how Supabase's answers are put
 * to people. Shared by the login form's actions and the app's sign-in
 * endpoints, so both say the same thing. No server imports: a "use server"
 * file can only export functions, so these can't live there.
 */

/** Where a new account goes first: it needs a username before anything else works. */
export const AFTER_SIGNUP = "/welcome?intro=1";

export const TOO_MANY_ATTEMPTS =
  "Too many attempts just now. Please wait a few minutes and try again.";

export const loginInput = z.object({ email: emailSchema, password: passwordSchema });
export const signupInput = z.object({ email: emailSchema, password: newPasswordSchema });

/** Supabase's raw messages are terse and jargon-y; say something useful. */
export function friendlyError(message: string) {
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
