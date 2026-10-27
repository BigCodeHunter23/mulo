import "server-only";
import type { Session, UserIdentity } from "@supabase/supabase-js";
import { hasTokenKey, openToken, revokeAppleToken, sealToken } from "@/lib/apple";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQueryError } from "@/lib/supabase/errors";

/**
 * Apple's refresh token for each account that signed in with Apple, kept
 * sealed in `apple_tokens` (migration 0021) so deleting the account can
 * cancel its Sign in with Apple link, as Apple requires. Only the service
 * role reads or writes the table.
 */

const MIGRATION = "0021_apple_tokens.sql";

const reason = (error: unknown) => (error instanceof Error ? error.name : "unknown error");

/** The parts of a fresh session that say how it was signed in. Every field may be missing. */
type SignIn = {
  provider_refresh_token?: Session["provider_refresh_token"];
  user: { identities?: readonly UserIdentity[] };
};

/**
 * The way of signing in this account used last: the identity with the newest
 * `last_sign_in_at`, which Supabase stamps on the identity a sign-in used.
 * Null when that can't be told for sure: no identities, any without a
 * readable date, or two at the very same moment.
 */
function lastSignInProvider(identities: readonly UserIdentity[] | undefined): string | null {
  if (!Array.isArray(identities) || identities.length === 0) return null;
  let newest: { provider: string; at: number } | null = null;
  let tied = false;
  for (const identity of identities) {
    const at = Date.parse(identity.last_sign_in_at ?? "");
    if (Number.isNaN(at)) return null;
    if (!newest || at > newest.at) {
      newest = { provider: identity.provider, at };
      tied = false;
    } else if (at === newest.at) {
      tied = true;
    }
  }
  return newest && !tied ? newest.provider : null;
}

/**
 * Apple's refresh token from a session just made, or null when this sign-in
 * wasn't with Apple. `app_metadata.provider` won't do: it names the way the
 * account was first made, so it would miss an email account signing in with
 * Apple, and would take Google's token for Apple's when an Apple account
 * signs in with Google. Never throws, so a missing field can't cost a session.
 */
export function appleTokenFrom(session: SignIn): string | null {
  const token = session.provider_refresh_token;
  if (!token) return null;
  return lastSignInProvider(session.user.identities) === "apple" ? token : null;
}

/**
 * Keeps Apple's refresh token for this account, sealed, with the client it
 * was issued to (revoking needs the same one). Never throws: failing to keep
 * it mustn't break a sign-in.
 */
export async function rememberAppleToken(
  userId: string,
  refreshToken: string,
  clientId: string,
): Promise<void> {
  try {
    const sealed = sealToken(refreshToken);
    if (!sealed) {
      console.warn("[apple] token not kept: there's no key to seal it with.");
      return;
    }
    const { error } = await createAdminClient()
      .from("apple_tokens")
      .upsert(
        { user_id: userId, client_id: clientId, refresh_token: sealed },
        { onConflict: "user_id" },
      );
    if (error) logQueryError("apple", error, MIGRATION);
  } catch (error) {
    console.error("[apple] token not kept:", reason(error));
  }
}

/**
 * Cancels this account's Sign in with Apple link by revoking the stored
 * token, then forgets it. True when there's nothing left linked (revoked, or
 * nothing was stored); false when Apple couldn't be told. The row is left on
 * a failed revoke; deleting the account removes it anyway.
 */
export async function forgetAppleLink(userId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("apple_tokens")
      .select("client_id, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logQueryError("apple", error, MIGRATION);
      return false;
    }
    if (!data) return true;

    const forget = async () => {
      const { error: deleteError } = await db.from("apple_tokens").delete().eq("user_id", userId);
      if (deleteError) logQueryError("apple", deleteError, MIGRATION);
    };

    if (!hasTokenKey()) {
      // Without the key the token can't be opened now, but it may once the
      // key is set again, so keep it.
      console.error("[apple] no key to open the stored token; keeping it.");
      return false;
    }
    const token = openToken(data.refresh_token);
    if (!token) {
      // The key is there but the value won't open: it was sealed under an
      // older key or changed, and can never be used again.
      console.error("[apple] stored token couldn't be opened; forgetting it.");
      await forget();
      return false;
    }
    if (!(await revokeAppleToken(token, data.client_id))) {
      console.error("[apple] revoke failed");
      return false;
    }
    await forget();
    return true;
  } catch (error) {
    console.error("[apple] couldn't cancel the Apple link:", reason(error));
    return false;
  }
}
