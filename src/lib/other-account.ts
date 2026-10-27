import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirming it's them in the app (`expectedUserId` on `auth/apple` and
 * `auth/oauth/exchange`) means signing in again, and a person can pick a
 * different Apple or Google account while doing it. Supabase has signed that
 * account in by then, and made it if it was new; this undoes both, so the
 * refusal leaves no live session and no stray empty account behind.
 */

/** How new an account must be to count as made by the sign-in being undone. */
export const JUST_MADE_MS = 2 * 60 * 1000;

type SignedIn = { access_token: string; user: { id: string; created_at?: string } };

/** Whether this sign-in is for some other account than the one confirming. */
export function isOtherAccount(session: SignedIn, expectedUserId: string | undefined): boolean {
  return expectedUserId !== undefined && session.user.id !== expectedUserId;
}

/**
 * Ends the session the sign-in made (only that one: the account's own
 * sessions elsewhere are somebody's and stay), then deletes the account if
 * this sign-in just made it: no profile yet (one is made only when a username
 * is picked) and created within the last two minutes. When unsure, the
 * account is kept. Never throws; the caller refuses either way.
 */
export async function undoSignIn(session: SignedIn, now = Date.now()): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error: signOutError } = await admin.auth.admin.signOut(session.access_token, "local");
    if (signOutError) {
      console.error("[confirm] couldn't end the other account's session:", signOutError.message);
    }

    // Either side of now, allowing for Supabase's clock and ours to differ a little.
    const made = Date.parse(session.user.created_at ?? "");
    if (!(Math.abs(now - made) <= JUST_MADE_MS)) return;

    const { data: profile, error: readError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (readError) {
      console.error("[confirm] couldn't check the other account for a profile:", readError.message);
      return;
    }
    if (profile) return;

    const { error: deleteError } = await admin.auth.admin.deleteUser(session.user.id);
    if (deleteError) {
      console.error("[confirm] couldn't remove the account just made:", deleteError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[confirm] undoing the other sign-in failed:", message);
  }
}
