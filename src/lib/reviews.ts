import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RATING_TABLES, reviewedTable } from "@/lib/rating-kinds";
import { hiddenFilter } from "@/lib/blocks";

export type Review = {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  review: string | null;
  created_at: string;
};

/**
 * Written reviews of an album or an artist, newest first. Ratings without
 * text are skipped; songs don't take reviews.
 */
export async function getReviews(kind: "album" | "artist", mbid: string): Promise<Review[]> {
  const supabase = await createClient();
  const { column } = RATING_TABLES[kind];
  const table = reviewedTable(kind);

  const query = supabase
    .from(table)
    .select("id, score, review, created_at, profiles!inner ( username, display_name, avatar_url )")
    .eq(column, mbid)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // Somebody blocked has nothing to say on any record, either way round.
  const hidden = await hiddenFilter();
  if (hidden) query.not("user_id", "in", hidden);

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.profiles.username,
    display_name: row.profiles.display_name,
    avatar_url: row.profiles.avatar_url,
    score: row.score,
    review: row.review,
    created_at: row.created_at,
  }));
}
