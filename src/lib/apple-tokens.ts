import "server-only";
import { openToken, revokeAppleToken, sealToken } from "@/lib/apple";
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

    const token = openToken(data.refresh_token);
    if (!token) {
      // Sealed under a key that's since changed: it can never be used again.
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
