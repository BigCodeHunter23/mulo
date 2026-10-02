"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { userIdSchema, usernameSchema } from "@/lib/validation";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";

export type FollowResult = { ok: true } | { ok: false; error: string; needsLogin?: boolean };

/** Follows or unfollows; called directly when the button is tapped. */
export async function setFollowing(
  targetId: string,
  username: string,
  follow: boolean,
): Promise<FollowResult> {
  if (!userIdSchema.safeParse(targetId).success || typeof follow !== "boolean") {
    return { ok: false, error: "Couldn't update that. Please try again." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to follow people.", needsLogin: true };
  }
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
  if (targetId === user.id) {
    return { ok: false, error: "You can't follow yourself." };
  }

  const supabase = await createClient();

  const { error } = follow
    ? await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId })
    : await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetId);

  // Following someone twice is harmless, not an error worth showing.
  if (error && error.code !== "23505") {
    return { ok: false, error: "Couldn't update that. Please try again." };
  }

  // The username only says which page to refresh; never trust it for more.
  if (usernameSchema.safeParse(username).success) revalidatePath(`/u/${username}`);
  revalidatePath("/people");
  revalidatePath("/");
  return { ok: true };
}
