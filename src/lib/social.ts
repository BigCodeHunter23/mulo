import "server-only";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";
import { hiddenPeople } from "@/lib/blocks";

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

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
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

  const [followers, following, ratings] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    // Albums, artists and songs all count, totalled by the database
    // (migration 0018) so nobody's stats stop at a thousand ratings.
    supabase.rpc("profile_rating_stats", { p_user: userId }).maybeSingle(),
  ]);
  if (ratings.error) logQueryError("social", ratings.error, "0018");

  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    ratings: ratings.data?.ratings ?? 0,
    averageScore: ratings.data?.average ?? null,
  };
}

/** Whether the signed-in user follows the given profile. Null if signed out. */
export async function getFollowState(
  targetUserId: string,
): Promise<{ signedIn: boolean; isSelf: boolean; isFollowing: boolean }> {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) return { signedIn: false, isSelf: false, isFollowing: false };
  if (user.id === targetUserId) return { signedIn: true, isSelf: true, isFollowing: false };

  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  return { signedIn: true, isSelf: false, isFollowing: Boolean(data) };
}

/** A slice of a long list: where it starts, and how many to show. */
export type Slice = { offset?: number; size?: number };

/**
 * Everyone with a profile, newest first, a slice at a time. Asking for one
 * more than `size` is how a page knows whether there's another after it.
 */
export async function listProfiles({ offset = 0, size = 200 }: Slice = {}): Promise<
  PublicProfile[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, created_at")
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + size - 1);

  // Blocked either way round: not somebody to be offered.
  const hidden = await hiddenPeople();
  return (data ?? []).filter((person) => !hidden.has(person.id));
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
  { offset = 0, size = 500 }: Slice = {},
): Promise<PublicProfile[]> {
  const supabase = await createClient();

  // Following: rows where they are the follower, and we want whoever they
  // point at. Followers: rows where they are the one being pointed at.
  const [match, wanted] =
    direction === "following" ? ["follower_id", "following_id"] : ["following_id", "follower_id"];

  const { data: links } = await supabase
    .from("follows")
    .select(wanted)
    .eq(match, userId)
    .order("created_at", { ascending: false })
    .order(wanted)
    .range(offset, offset + size - 1);

  // Which column is wanted depends on the direction, which the typed query
  // builder can't follow.
  const ids = ((links ?? []) as unknown as Record<string, string>[]).map((row) => row[wanted]);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, created_at")
    .in("id", ids);

  // Keep the order the follows came back in — most recent first — which
  // fetching the profiles doesn't preserve. Anybody blocked drops out.
  const hidden = await hiddenPeople();
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids
    .filter((id) => !hidden.has(id))
    .map((id) => byId.get(id))
    .filter((row): row is PublicProfile => Boolean(row));
}

/**
 * Everyone somebody follows. Looked up once per request: a single album page
 * asks from several places.
 */
export const getFollowingIds = cache(async (userId: string): Promise<string[]> => {
  const supabase = await createClient();

  const { data } = await readAll((from, to) =>
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .order("following_id")
      .range(from, to),
  );

  return data.map((f) => f.following_id);
});

/** Somebody's username from their id, for building links to their pages. */
export async function getUsername(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}
