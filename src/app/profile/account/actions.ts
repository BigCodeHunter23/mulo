"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  changeEmailFor,
  changePasswordFor,
  deleteAccountFor,
  setPasswordFor,
  type AccountOutcome,
} from "@/lib/account";
import { NOT_FRESH } from "@/lib/app-api";
import { getSessionFacts } from "@/lib/session-facts";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { field } from "@/lib/validation";

export type AccountState = { error?: string; message?: string };

const LOGGED_OUT = "You've been logged out. Log in again to change your account.";

/** The shared outcome, in the shape the account page's forms read. */
function toState(outcome: AccountOutcome): AccountState {
  return outcome.ok ? { message: outcome.message } : { error: outcome.error };
}

/**
 * The few minutes after signing in have run out while the page was open: draw
 * it again, so it offers "Continue with Apple" (or Google) in place of the form.
 */
function whenStale(outcome: AccountOutcome): void {
  if (!outcome.ok && outcome.error === NOT_FRESH) revalidatePath("/profile/account");
}

/**
 * The work lives in `src/lib/account.ts`, which the app's endpoints share.
 * How this browser signed in (`getSessionFacts`) is read here, on the server,
 * from the verified session: never from the form.
 */
export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };
  return toState(
    await changePasswordFor(
      user,
      { current: field(formData, "current"), next: field(formData, "next") },
      await getSessionFacts(),
    ),
  );
}

/**
 * A first password, for an account made with Apple or Google. Once it's set,
 * the session is refreshed so its token says so, and the page shows the
 * usual password and email forms from then on.
 */
export async function setPassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  const outcome = await setPasswordFor(
    user,
    { next: field(formData, "next") },
    await getSessionFacts(),
  );
  whenStale(outcome);
  if (outcome.ok) {
    // Best effort: until the token is refreshed the page still offers to set one.
    const supabase = await createClient();
    await supabase.auth.refreshSession().catch(() => undefined);
    revalidatePath("/profile/account");
  }
  return toState(outcome);
}

export async function changeEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };
  return toState(
    await changeEmailFor(
      user,
      { email: field(formData, "email"), current: field(formData, "current") },
      await getSessionFacts(),
    ),
  );
}

/**
 * Deletes everything, then signs this browser out and says goodbye, with how
 * to remove MULO from their Apple account when Apple couldn't be told.
 */
export async function deleteAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  // An account without a password has no field for one.
  const current = field(formData, "current");
  const outcome = await deleteAccountFor(
    user,
    { ...(current ? { current } : {}), confirm: field(formData, "confirm") },
    await getSessionFacts(),
  );
  if (!outcome.ok) {
    whenStale(outcome);
    return { error: outcome.error };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(outcome.appleLinkLeft ? "/?goodbye=apple" : "/?goodbye=1");
}
