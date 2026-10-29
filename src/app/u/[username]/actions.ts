"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { userIdSchema, usernameSchema } from "@/lib/validation";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import { logQueryError } from "@/lib/supabase/errors";
import type { FollowResult } from "@/lib/app-api";
import { notifyFollow } from "@/lib/push/events";
import { later } from "@/lib/push/later";
import type { ReportReason } from "@/lib/report-reasons";

export type { FollowResult };

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

  // A first follow tells them; a repeat (23505) or an unfollow does not.
  if (follow && !error) later(() => notifyFollow(user.id, targetId));

  // The username only says which page to refresh; never trust it for more.
  if (usernameSchema.safeParse(username).success) revalidatePath(`/u/${username}`);
  revalidatePath("/people");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Blocks or unblocks somebody.
 *
 * A block hides them from you and you from them (migration 0020), and ends
 * any following in either direction: there's no sense hiding somebody's
 * ratings from a feed while their name still sits in the followers list.
 */
export async function setBlocked(
  targetId: string,
  username: string,
  blocked: boolean,
): Promise<FollowResult> {
  if (!userIdSchema.safeParse(targetId).success || typeof blocked !== "boolean") {
    return { ok: false, error: "Couldn't update that. Please try again." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to block people.", needsLogin: true };
  }
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
  if (targetId === user.id) {
    return { ok: false, error: "You can't block yourself." };
  }

  const supabase = await createClient();

  if (blocked) {
    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: user.id, blocked_id: targetId });
    // Blocking somebody twice is harmless, not an error worth showing.
    if (error && error.code !== "23505") {
      logQueryError("blocks", error, "0020");
      return { ok: false, error: "Couldn't block them. Please try again." };
    }

    // A block tells MULO too, as the App Store asks of community apps: the
    // person lands in the reports inbox. Reported already is fine, and the
    // block stands even if the report can't be filed.
    if (!error) {
      const { error: reportError } = await supabase.from("reports").insert({
        reporter_id: user.id,
        reported_profile_id: targetId,
        reason: "Something else" satisfies ReportReason,
        detail: "Sent when they blocked this person.",
      });
      if (reportError && reportError.code !== "23505") {
        logQueryError("reports", reportError, "0006");
      }
    }

    await supabase
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${user.id},following_id.eq.${targetId}),` +
          `and(follower_id.eq.${targetId},following_id.eq.${user.id})`,
      );
  } else {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetId);
    if (error) {
      logQueryError("blocks", error, "0020");
      return { ok: false, error: "Couldn't unblock them. Please try again." };
    }
  }

  if (usernameSchema.safeParse(username).success) revalidatePath(`/u/${username}`);
  revalidatePath("/people");
  revalidatePath("/profile/account");
  revalidatePath("/", "layout");
  return { ok: true };
}
