import "server-only";
import { createClient, type CurrentUser } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";
import { pushCopyOf, type PushCopy } from "@/lib/push/store";

/**
 * Everything one person has put into MULO, as a file they can keep, for the
 * account page's download and the app's alike.
 *
 * Their own rows only, read through their own session, so row-level security
 * applies exactly as it does anywhere else. Anything that can run past the
 * API's 1,000 rows is read a page at a time, so the file is never quietly
 * short. Plain JSON rather than a format only MULO can read: it's their data,
 * not a lock-in.
 */
export async function exportFor(user: CurrentUser): Promise<{ body: string; filename: string }> {
  const supabase = await createClient();
  // Closed to their own session, so read with the service role (src/lib/push/store.ts).
  // Before migration 0023 runs there's nothing to read, and the rest still comes.
  const push = pushCopyOf(user.id).catch((error: unknown): PushCopy => {
    console.error("[account export] push settings couldn't be read:", error);
    return { settings: null, phones: [] };
  });

  const [profile, albums, artists, songs, lists, following, followers, picks] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, bio, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    readAll((from, to) =>
      supabase
        .from("ratings")
        .select("release_mbid, score, review, created_at, updated_at")
        .eq("user_id", user.id)
        .order("release_mbid")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("artist_ratings")
        .select("artist_mbid, score, review, created_at, updated_at")
        .eq("user_id", user.id)
        .order("artist_mbid")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("song_ratings")
        .select("song_mbid, release_mbid, score, created_at, updated_at")
        .eq("user_id", user.id)
        .order("song_mbid")
        .range(from, to),
    ),
    supabase.from("lists").select("id, title, description, created_at").eq("user_id", user.id),
    readAll((from, to) =>
      supabase
        .from("follows")
        .select("following_id, created_at")
        .eq("follower_id", user.id)
        .order("following_id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", user.id)
        .order("follower_id")
        .range(from, to),
    ),
    supabase.from("top_albums").select("release_mbid, position").eq("user_id", user.id),
  ]);

  // Only their own lists' albums: anyone's are readable, so ask for theirs by id.
  const mine = (lists.data ?? []).map((list) => list.id);
  const listItems =
    mine.length > 0
      ? await readAll((from, to) =>
          supabase
            .from("list_items")
            .select("list_id, release_mbid, position, note")
            .in("list_id", mine)
            .order("list_id")
            .order("release_mbid")
            .range(from, to),
        )
      : { data: [], error: null };

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

  const pushCopy = await push;

  const body = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null },
    profile: profile.data ?? null,
    album_ratings: albums.data,
    artist_ratings: artists.data,
    song_ratings: songs.data,
    lists: (lists.data ?? []).map((list) => ({
      ...list,
      items: listItems.data.filter((item) => item.list_id === list.id),
    })),
    goat: picks.data ?? [],
    following: following.data,
    followers: followers.data,
    push_settings: pushCopy.settings,
    push_phones: pushCopy.phones,
  };

  const day = new Date().toISOString().slice(0, 10);
  return { body: JSON.stringify(body, null, 2), filename: `mulo-${day}.json` };
}

/** The headers that make a browser, or the app, save it as a file. */
export function exportHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
}
