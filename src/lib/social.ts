import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
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
    .select("id, username, display_name, avatar_url, bio, created_at")
    .eq("username", username)
    .maybeSingle();

  return data ?? null;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const supabase = await createClient();

  const [followers, following, albums, artists, songs] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase.from("ratings").select("score").eq("user_id", userId),
    supabase.from("artist_ratings").select("score").eq("user_id", userId),
    supabase.from("song_ratings").select("score").eq("user_id", userId),
  ]);

  // Albums, artists and songs all count.
  const scores: number[] = [albums, artists, songs].flatMap((result) =>
    (result.data ?? []).map((r) => r.score),
  );

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

  const user = await getCurrentUser();

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
    .select("id, username, display_name, avatar_url, bio, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return data ?? [];
}

/**
 * The people following somebody, or the people they follow.
 *
 * A count on a profile is a dead end — the interesting question is always
 * *who*. Both directions come from the same `follows` table read from opposite
 * ends, so one function covers both.
 */
export async function listFollows(
  userId: string,
  direction: "followers" | "following",
): Promise<PublicProfile[]> {
  const supabase = await createClient();

  // Following: rows where they are the follower, and we want whoever they
  // point at. Followers: rows where they are the one being pointed at.
  const [match, wanted] =
    direction === "following"
      ? ["follower_id", "following_id"]
      : ["following_id", "follower_id"];

  const { data: links } = await supabase
    .from("follows")
    .select(wanted)
    .eq(match, userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const ids = ((links ?? []) as unknown as Record<string, string>[]).map(
    (row) => row[wanted],
  );
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, created_at")
    .in("id", ids);

  // Keep the order the follows came back in — most recent first — which
  // fetching the profiles doesn't preserve.
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is PublicProfile => Boolean(row));
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  return (data ?? []).map((f) => f.following_id);
}
