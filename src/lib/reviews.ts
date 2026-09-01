import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Review = {
  username: string;
  display_name: string | null;
  score: number;
  review: string | null;
  created_at: string;
};

/** Written reviews for a release, newest first. Ratings without text are skipped. */
export async function getReleaseReviews(
  releaseMbid: string,
): Promise<Review[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ratings")
    .select("score, review, created_at, profiles!inner ( username, display_name )")
    .eq("release_mbid", releaseMbid)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  type Row = {
    score: number;
    review: string | null;
    created_at: string;
    profiles: { username: string; display_name: string | null };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    username: row.profiles.username,
    display_name: row.profiles.display_name,
    score: row.score,
    review: row.review,
    created_at: row.created_at,
  }));
}
