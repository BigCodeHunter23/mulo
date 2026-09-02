"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FollowState = { error?: string };

export async function toggleFollow(
  _prev: FollowState,
  formData: FormData,
): Promise<FollowState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const targetId = String(formData.get("target_id") ?? "");
  const username = String(formData.get("username") ?? "");
  const intent = String(formData.get("intent") ?? "");

  if (targetId === user.id) {
    return { error: "You can't follow yourself." };
  }

  if (intent === "unfollow") {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetId);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, following_id: targetId });

    // Following twice is harmless, not an error worth showing.
    if (error && error.code !== "23505") return { error: error.message };
  }

  revalidatePath(`/u/${username}`);
  revalidatePath("/");
  revalidatePath("/people");
  return {};
}
