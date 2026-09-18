import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Versus nominations: matchups people want to see, most-backed first
 * (migration 0015). Each pairing exists once, stored with the lower artist id
 * on the left; nominating one that already exists simply backs it. The owner
 * reads this list when choosing the next pairs for `versus-pairs.ts`.
 */

export type Nomination = {
  id: number;
  left: { mbid: string; name: string; image: string | null };
  right: { mbid: string; name: string; image: string | null };
  backers: number;
  /** Whether the signed-in person backs it. */
  mine: boolean;
};

type ArtistRow = { mbid: string; name: string; image_url: string | null };

export async function getNominations(userId: string | null, limit = 20): Promise<Nomination[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("versus_nominations")
    .select(
      `id, created_at,
       left:artists!versus_nominations_left_artist_mbid_fkey ( mbid, name, image_url ),
       right:artists!versus_nominations_right_artist_mbid_fkey ( mbid, name, image_url ),
       versus_nomination_backers ( user_id )`,
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error || !data) return [];

  const rows = data as unknown as {
    id: number;
    created_at: string;
    left: ArtistRow | null;
    right: ArtistRow | null;
    versus_nomination_backers: { user_id: string }[];
  }[];

  return rows
    .filter((row) => row.left && row.right)
    .map((row) => ({
      id: row.id,
      left: { mbid: row.left!.mbid, name: row.left!.name, image: row.left!.image_url || null },
      right: { mbid: row.right!.mbid, name: row.right!.name, image: row.right!.image_url || null },
      backers: row.versus_nomination_backers.length,
      mine: userId !== null && row.versus_nomination_backers.some((b) => b.user_id === userId),
    }))
    .sort((a, b) => b.backers - a.backers)
    .slice(0, limit);
}
