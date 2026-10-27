"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  changeEmailFor,
  changePasswordFor,
  deleteAccountFor,
  type AccountOutcome,
} from "@/lib/account";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { field } from "@/lib/validation";

export type AccountState = { error?: string; message?: string };

const LOGGED_OUT = "You've been logged out. Log in again to change your account.";

/** The shared outcome, in the shape the account page's forms read. */
function toState(outcome: AccountOutcome): AccountState {
  return outcome.ok ? { message: outcome.message } : { error: outcome.error };
}

/** The work lives in `src/lib/account.ts`, which the app's endpoints share. */
export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };
  return toState(
    await changePasswordFor(user, {
      current: field(formData, "current"),
      next: field(formData, "next"),
    }),
  );
}

export async function changeEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };
  return toState(
    await changeEmailFor(user, {
      email: field(formData, "email"),
      current: field(formData, "current"),
    }),
  );
}

/** Deletes everything, then signs this browser out and says goodbye. */
export async function deleteAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGGED_OUT };

  const outcome = await deleteAccountFor(user, {
    current: field(formData, "current"),
    confirm: field(formData, "confirm"),
  });
  if (!outcome.ok) return { error: outcome.error };

  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?goodbye=1");
}
