import "server-only";
import type { ArtistSummary } from "@/lib/app-api";
import { SUGGESTIONS_MAX } from "@/lib/artist-follows-shared";
import type { Slice } from "@/lib/social";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isMissingTable, logQueryError } from "@/lib/supabase/errors";

/**
 * Following artists (migration 0026), read through the visitor's own
 * session: follows are public, like following people.
 */

function logUnlessMissing(error: { code?: string; message: string }) {
  if (!isMissingTable(error)) logQueryError("artist follows", error, "0026");
}

/** Whether the signed-in person follows an artist, and how many people do. */
export async function getArtistFollowState(
  mbid: string,
): Promise<{ following: boolean; followers: number }> {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  const [count, mine] = await Promise.all([
    supabase
      .from("artist_follows")
      .select("user_id", { count: "exact", head: true })
      .eq("artist_mbid", mbid),
    user
      ? supabase
          .from("artist_follows")
          .select("user_id")
          .eq("artist_mbid", mbid)
          .eq("user_id", user.id)
          .maybeSingle()
      : null,
  ]);
  if (count.error) logUnlessMissing(count.error);
  return { following: Boolean(mine?.data), followers: count.count ?? 0 };
}

/** How many artists somebody follows, for their profile. */
export async function countFollowedArtists(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("artist_follows")
    .select("artist_mbid", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) logUnlessMissing(error);
  return count ?? 0;
}

/** The artists somebody follows, newest first, a slice at a time. */
export async function listFollowedArtists(
  userId: string,
  { offset = 0, size = 50 }: Slice = {},
): Promise<ArtistSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artist_follows")
    .select("artists!inner ( mbid, name, image_url )")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("artist_mbid")
    .range(offset, offset + size - 1);
  if (error) {
    logUnlessMissing(error);
    return [];
  }
  // An empty image_url means MULO looked and there wasn't a photo.
  return (data ?? []).map(({ artists }) => ({
    mbid: artists.mbid,
    name: artists.name,
    image_url: artists.image_url || null,
  }));
}

/**
 * Up to 12 artists the signed-in person rates highest and doesn't follow
 * yet, best first: the database ranks them (migration 0026's
 * artist_suggestions, from artist ratings, high album ratings, the GOAT and
 * the diary). Nobody signed in has none.
 */
export async function getArtistSuggestions(limit = SUGGESTIONS_MAX): Promise<ArtistSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("artist_suggestions", { p_limit: limit });
  if (error) {
    logQueryError("artist follows", error, "0026");
    return [];
  }
  return (data ?? []).flatMap((row): ArtistSummary[] =>
    row.mbid && row.name
      ? [{ mbid: row.mbid, name: row.name, image_url: row.image_url || null }]
      : [],
  );
}
