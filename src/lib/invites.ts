import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Remembers which invite somebody arrived through, until they sign up. */
export const INVITE_COOKIE = "mulo_invite";

const CODE = /^[0-9a-f]{10}$/;

export type Inviter = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function isInviteCode(code: string) {
  return CODE.test(code);
}

/**
 * Who an invite code belongs to. Codes are private to their owners, so this
 * looks them up with the service role, on the server only.
 */
export async function findInvite(code: string): Promise<Inviter | null> {
  if (!isInviteCode(code)) return null;

  const { data } = await createAdminClient()
    .from("invites")
    .select("profiles!inner ( id, username, display_name, avatar_url )")
    .eq("code", code)
    .maybeSingle();

  const joined = data?.profiles;
  return (Array.isArray(joined) ? joined[0] : joined) ?? null;
}

/**
 * Makes a newly signed-up person and whoever invited them follow each other,
 * which is the whole promise of an invite link. Both follows are written with
 * the service role, since one of them is made on the inviter's behalf.
 */
export async function connectInvite(newUserId: string, code: string) {
  const inviter = await findInvite(code);
  if (!inviter || inviter.id === newUserId) return;

  await createAdminClient()
    .from("follows")
    .upsert(
      [
        { follower_id: newUserId, following_id: inviter.id },
        { follower_id: inviter.id, following_id: newUserId },
      ],
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );
}

/**
 * Finishes an invite once somebody has an account: called the moment sign-up
 * hands back a session, or when they follow the confirmation email. The
 * cookie only exists in the browser that opened the invite, so a link opened
 * elsewhere simply has nothing to connect.
 */
export async function consumeInviteCookie(userId: string) {
  const store = await cookies();
  const code = store.get(INVITE_COOKIE)?.value;
  if (!code) return;

  await connectInvite(userId, code);
  store.delete(INVITE_COOKIE);
}
