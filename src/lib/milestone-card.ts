import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { isMilestone } from "@/lib/milestones";

export type MilestoneCard = {
  count: number;
  profile: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  average: number | null;
  /** Their highest-scored albums, for the cover row. */
  top: { mbid: string; title: string; artist: string | null; cover: string | null; score: number }[];
};

/**
 * What a milestone share card shows: who, how many, and their best-scored
 * records. Only a real milestone they've actually passed gets a card, so a
 * made-up link lands on a 404 rather than a false boast.
 */
export async function getMilestoneCard(
  username: string,
  count: number,
): Promise<MilestoneCard | null> {
  if (!isMilestone(count)) return null;

  const supabase = createPublicClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return null;

  const { data } = await supabase
    .from("ratings")
    .select("score, releases ( mbid, title, artist_credit, cover_art_url )")
    .eq("user_id", profile.id)
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(4000);

  const rows = (data ?? []) as unknown as {
    score: number;
    releases: { mbid: string; title: string; artist_credit: string | null; cover_art_url: string | null } | null;
  }[];
  if (rows.length < count) return null;

  return {
    count,
    profile: {
      id: String(profile.id),
      username: String(profile.username),
      name: String(profile.display_name || profile.username),
      avatarUrl: (profile.avatar_url as string | null) ?? null,
    },
    average: rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
    top: rows
      .filter((row) => row.releases)
      .slice(0, 8)
      .map((row) => ({
        mbid: row.releases!.mbid,
        title: row.releases!.title,
        artist: row.releases!.artist_credit,
        cover: row.releases!.cover_art_url,
        score: row.score,
      })),
  };
}
