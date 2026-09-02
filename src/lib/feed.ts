import "server-only";
import { createClient } from "@/lib/supabase/server";

export type FeedItem = {
  id: number;
  score: number;
  review: string | null;
  created_at: string;
  author: { username: string; display_name: string | null };
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    artist: { mbid: string; name: string } | null;
  };
};

type FeedRow = {
  id: number;
  score: number;
  review: string | null;
  created_at: string;
  profiles: { username: string; display_name: string | null };
  releases: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    artists: { mbid: string; name: string } | null;
  };
};

const SELECT = `
  id, score, review, created_at,
  profiles!inner ( username, display_name ),
  releases!inner ( mbid, title, cover_art_url, artists ( mbid, name ) )
`;

function toFeedItems(rows: FeedRow[]): FeedItem[] {
  return rows.map((row) => ({
    id: row.id,
    score: row.score,
    review: row.review,
    created_at: row.created_at,
    author: {
      username: row.profiles.username,
      display_name: row.profiles.display_name,
    },
    release: {
      mbid: row.releases.mbid,
      title: row.releases.title,
      cover_art_url: row.releases.cover_art_url,
      artist: row.releases.artists,
    },
  }));
}

/**
 * Ratings from the people a user follows, newest first. A plain query, not a
 * fan-out table — at this scale that would be needless machinery.
 */
export async function getFollowingFeed(
  userId: string,
  limit = 50,
): Promise<FeedItem[]> {
  const supabase = await createClient();

  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  const followingIds = (follows ?? []).map((f) => f.following_id);
  if (followingIds.length === 0) return [];

  const { data } = await supabase
    .from("ratings")
    .select(SELECT)
    .in("user_id", followingIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  return toFeedItems((data ?? []) as unknown as FeedRow[]);
}

/** Recent activity across everyone, so a new account has something to read. */
export async function getGlobalFeed(limit = 30): Promise<FeedItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ratings")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return toFeedItems((data ?? []) as unknown as FeedRow[]);
}

/** Everything one person has rated, for their public profile. */
export async function getUserFeed(
  userId: string,
  limit = 50,
): Promise<FeedItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ratings")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return toFeedItems((data ?? []) as unknown as FeedRow[]);
}
