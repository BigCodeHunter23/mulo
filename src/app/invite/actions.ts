"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { INVITE_COOKIE, isInviteCode } from "@/lib/invites";

export type InviteLinkResult = { ok: true; path: string } | { ok: false; error: string };

/** The signed-in person's invite link, made the first time they ask for it. */
export async function getInviteLink(): Promise<InviteLinkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to invite friends." };

  const supabase = await createClient();

  const existing = await supabase
    .from("invites")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.data?.code) return { ok: true, path: `/join/${existing.data.code}` };

  // The code itself comes from the database default.
  const created = await supabase
    .from("invites")
    .insert({ user_id: user.id })
    .select("code")
    .single();

  if (created.error || !created.data) {
    // Needs a profile first, since invites belong to one.
    return {
      ok: false,
      error:
        created.error?.code === "23503"
          ? "Pick a username first, then invite friends."
          : "Couldn't make your invite link. Please try again.",
    };
  }

  return { ok: true, path: `/join/${created.data.code}` };
}

/** Remembers the invite for the signup that follows. */
export async function acceptInvite(code: string) {
  if (isInviteCode(code)) {
    const store = await cookies();
    store.set(INVITE_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  redirect("/login?mode=signup");
}
