import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentDrop } from "@/lib/drop";

/**
 * Taste twin of the week: the person on MULO who scores music most like you.
 *
 * Everyone else who has rated the same albums and artists as you is compared
 * the way a profile's taste match is (how much of the widest possible gap
 * you avoid, on average). The closest few take turns, one a week, so a
 * runaway best match doesn't sit there forever and the card keeps
 * introducing people. Nothing is stored: it's worked out from ratings on
 * each view, and the week number is The Drop's.
 */

export type TasteTwin = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  percent: number;
  shared: number;
  /** Something you both love, to open the conversation with. */
  agreement: { title: string; href: string; yours: number; theirs: number } | null;
  following: boolean;
};

/** Below this there isn't enough in common to call anybody a twin. */
const MINIMUM = 5;
/** Matches this close to the best take turns week by week. */
const CLOSE = 5;
const ROTATION = 5;
const CHUNK = 200;

type Row = { user_id: string; score: number };

export async function getTasteTwin(userId: string): Promise<TasteTwin | null> {
  const supabase = await createClient();

  const [{ data: myAlbums }, { data: myArtists }, { data: follows }] = await Promise.all([
    supabase.from("ratings").select("release_mbid, score").eq("user_id", userId).limit(4000),
    supabase.from("artist_ratings").select("artist_mbid, score").eq("user_id", userId).limit(4000),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);

  const albums = new Map(
    ((myAlbums ?? []) as { release_mbid: string; score: number }[]).map((r) => [r.release_mbid, r.score]),
  );
  const artists = new Map(
    ((myArtists ?? []) as { artist_mbid: string; score: number }[]).map((r) => [r.artist_mbid, r.score]),
  );
  if (albums.size + artists.size < MINIMUM) return null;

  // Everybody else's scores on the same things, a chunk of ids at a time.
  const others = new Map<string, { gap: number; shared: number; best: { mbid: string; yours: number; theirs: number } | null }>();
  function add(row: Row, yours: number, albumMbid: string | null) {
    const entry = others.get(row.user_id) ?? { gap: 0, shared: 0, best: null };
    entry.gap += Math.abs(yours - row.score);
    entry.shared += 1;
    // The agreement worth showing: an album you both rate highly.
    if (albumMbid && Math.min(yours, row.score) >= 8) {
      const low = Math.min(yours, row.score);
      if (!entry.best || low > Math.min(entry.best.yours, entry.best.theirs)) {
        entry.best = { mbid: albumMbid, yours, theirs: row.score };
      }
    }
    others.set(row.user_id, entry);
  }

  const albumIds = [...albums.keys()];
  const artistIds = [...artists.keys()];
  const lookups = [];
  for (let i = 0; i < albumIds.length; i += CHUNK) {
    lookups.push(
      supabase
        .from("ratings")
        .select("user_id, release_mbid, score")
        .in("release_mbid", albumIds.slice(i, i + CHUNK))
        .neq("user_id", userId)
        .limit(10000)
        .then(({ data }) => {
          for (const row of (data ?? []) as (Row & { release_mbid: string })[]) {
            add(row, albums.get(row.release_mbid)!, row.release_mbid);
          }
        }),
    );
  }
  for (let i = 0; i < artistIds.length; i += CHUNK) {
    lookups.push(
      supabase
        .from("artist_ratings")
        .select("user_id, artist_mbid, score")
        .in("artist_mbid", artistIds.slice(i, i + CHUNK))
        .neq("user_id", userId)
        .limit(10000)
        .then(({ data }) => {
          for (const row of (data ?? []) as (Row & { artist_mbid: string })[]) {
            add(row, artists.get(row.artist_mbid)!, null);
          }
        }),
    );
  }
  await Promise.all(lookups);

  const ranked = [...others.entries()]
    .filter(([, entry]) => entry.shared >= MINIMUM)
    .map(([id, entry]) => ({
      id,
      ...entry,
      percent: Math.max(0, Math.min(100, Math.round(100 - (entry.gap / entry.shared / 9) * 100))),
    }))
    .sort((a, b) => b.percent - a.percent || b.shared - a.shared);
  if (ranked.length === 0) return null;

  const pool = ranked.filter((r) => r.percent >= ranked[0].percent - CLOSE).slice(0, ROTATION);
  const twin = pool[(currentDrop().week - 1) % pool.length];

  const [{ data: profile }, { data: album }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", twin.id)
      .maybeSingle(),
    twin.best
      ? supabase.from("releases").select("title").eq("mbid", twin.best.mbid).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!profile) return null;

  const followingIds = new Set(
    ((follows ?? []) as { following_id: string }[]).map((f) => f.following_id),
  );

  return {
    id: twin.id,
    username: String(profile.username),
    displayName: (profile.display_name as string | null) ?? null,
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    percent: twin.percent,
    shared: twin.shared,
    agreement:
      twin.best && album
        ? {
            title: String(album.title),
            href: `/album/${twin.best.mbid}`,
            yours: twin.best.yours,
            theirs: twin.best.theirs,
          }
        : null,
    following: followingIds.has(twin.id),
  };
}
