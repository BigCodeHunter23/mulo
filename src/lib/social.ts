import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
};

export type ProfileStats = {
  followers: number;
  following: number;
  ratings: number;
  averageScore: number | null;
};

export async function getProfileByUsername(
  username: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, created_at")
    .eq("username", username)
    .maybeSingle();

  return data ?? null;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const supabase = await createClient();

  const [followers, following, ratings] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase.from("ratings").select("score").eq("user_id", userId),
  ]);

  const scores = (ratings.data ?? []).map((r) => r.score);

  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    ratings: scores.length,
    averageScore:
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null,
  };
}

/** Whether the signed-in user follows the given profile. Null if signed out. */
export async function getFollowState(
  targetUserId: string,
): Promise<{ signedIn: boolean; isSelf: boolean; isFollowing: boolean }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { signedIn: false, isSelf: false, isFollowing: false };
  if (user.id === targetUserId)
    return { signedIn: true, isSelf: true, isFollowing: false };

  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  return { signedIn: true, isSelf: false, isFollowing: Boolean(data) };
}

/**
 * Everyone with a profile, newest first. Fine at soft-launch scale; this
 * would need proper search and paging before it grew much past a few hundred.
 */
export async function listProfiles(): Promise<PublicProfile[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return data ?? [];
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  return (data ?? []).map((f) => f.following_id);
}
