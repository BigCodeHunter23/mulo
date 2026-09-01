import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReleaseScores = {
  community: number | null;
  communityCount: number;
  you: number | null;
  following: number | null;
  followingCount: number;
};

export type OwnRating = {
  score: number;
  review: string | null;
} | null;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The three scores shown on an album page. "Following" needs the follows
 * table (phase 5); until that exists it simply has nobody to average.
 */
export async function getReleaseScores(
  releaseMbid: string,
): Promise<ReleaseScores> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ratings } = await supabase
    .from("ratings")
    .select("user_id, score")
    .eq("release_mbid", releaseMbid);

  const all = ratings ?? [];

  const you = user
    ? (all.find((r) => r.user_id === user.id)?.score ?? null)
    : null;

  let following: number | null = null;
  let followingCount = 0;

  if (user) {
    const { data: follows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    const followedIds = new Set((follows ?? []).map((f) => f.following_id));
    const followedScores = all
      .filter((r) => followedIds.has(r.user_id))
      .map((r) => r.score);

    following = average(followedScores);
    followingCount = followedScores.length;
  }

  return {
    community: average(all.map((r) => r.score)),
    communityCount: all.length,
    you,
    following,
    followingCount,
  };
}

export async function getOwnRating(releaseMbid: string): Promise<OwnRating> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("ratings")
    .select("score, review")
    .eq("release_mbid", releaseMbid)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

export type RatingWithRelease = {
  score: number;
  review: string | null;
  created_at: string;
  updated_at: string;
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    release_date: string | null;
    artist: { mbid: string; name: string } | null;
  };
};

/** Everything the signed-in user has rated, for the "My Ratings" page. */
export async function getOwnRatings(
  sort: "recent" | "highest" | "lowest" = "recent",
): Promise<RatingWithRelease[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const query = supabase
    .from("ratings")
    .select(
      `score, review, created_at, updated_at,
       releases!inner (
         mbid, title, cover_art_url, release_date,
         artists ( mbid, name )
       )`,
    )
    .eq("user_id", user.id);

  if (sort === "highest") query.order("score", { ascending: false });
  else if (sort === "lowest") query.order("score", { ascending: true });
  else query.order("created_at", { ascending: false });

  const { data } = await query;

  type Row = {
    score: number;
    review: string | null;
    created_at: string;
    updated_at: string;
    releases: {
      mbid: string;
      title: string;
      cover_art_url: string | null;
      release_date: string | null;
      artists: { mbid: string; name: string } | null;
    };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    score: row.score,
    review: row.review,
    created_at: row.created_at,
    updated_at: row.updated_at,
    release: {
      mbid: row.releases.mbid,
      title: row.releases.title,
      cover_art_url: row.releases.cover_art_url,
      release_date: row.releases.release_date,
      artist: row.releases.artists,
    },
  }));
}
