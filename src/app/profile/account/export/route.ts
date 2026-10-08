import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { allowUser } from "@/lib/rate-limit";
import { logQueryError } from "@/lib/supabase/errors";

/**
 * Everything one person has put into MULO, as a file they can keep.
 *
 * Their own rows only, read through their own session, so row-level security
 * applies exactly as it does anywhere else. Plain JSON rather than a format
 * only MULO can read: it's their data, not a lock-in.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Log in first.", { status: 401 });
  if (!(await allowUser("write", user.id))) {
    return new NextResponse("Too many requests. Try again shortly.", { status: 429 });
  }

  const supabase = await createClient();

  const [profile, albums, artists, songs, lists, listItems, following, followers, picks] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("username, display_name, bio, avatar_url, created_at")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("ratings")
        .select("release_mbid, score, review, created_at, updated_at")
        .eq("user_id", user.id),
      supabase
        .from("artist_ratings")
        .select("artist_mbid, score, review, created_at, updated_at")
        .eq("user_id", user.id),
      supabase
        .from("song_ratings")
        .select("song_mbid, release_mbid, score, created_at, updated_at")
        .eq("user_id", user.id),
      supabase.from("lists").select("id, title, description, created_at").eq("user_id", user.id),
      supabase.from("list_items").select("list_id, release_mbid, position, note"),
      supabase.from("follows").select("following_id, created_at").eq("follower_id", user.id),
      supabase.from("follows").select("follower_id, created_at").eq("following_id", user.id),
      supabase.from("top_albums").select("release_mbid, position").eq("user_id", user.id),
    ]);

  for (const result of [
    profile,
    albums,
    artists,
    songs,
    lists,
    listItems,
    following,
    followers,
    picks,
  ]) {
    if (result.error) logQueryError("account export", result.error);
  }

  const mine = new Set((lists.data ?? []).map((list) => list.id));
  const body = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null },
    profile: profile.data ?? null,
    album_ratings: albums.data ?? [],
    artist_ratings: artists.data ?? [],
    song_ratings: songs.data ?? [],
    lists: (lists.data ?? []).map((list) => ({
      ...list,
      items: (listItems.data ?? []).filter((item) => mine.has(item.list_id)),
    })),
    goat: picks.data ?? [],
    following: following.data ?? [],
    followers: followers.data ?? [],
  };

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mulo-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
