import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Badge = {
  slug: string;
  name: string;
  /** How it was earned, in plain words. */
  description: string;
};

type AlbumRating = { release_mbid: string; score: number; review: string | null };
type ArtistRating = { artist_mbid: string; score: number; review: string | null };
type SongRating = { song_mbid: string; release_mbid: string; score: number };

// Long lists of ids make long URLs, so the catalogue lookups are capped. At
// soft-launch scale nobody comes close; past that these belong in a view.
const ID_LIMIT = 200;

/**
 * Badges are worked out from what somebody has rated rather than stored, so
 * they can never drift from the truth and there is nothing to maintain. The
 * ones worth having reward range and depth, not volume alone: rating without
 * listening should not pay.
 */
export async function getBadges(userId: string): Promise<Badge[]> {
  const supabase = await createClient();
  const earned: Badge[] = [];
  const award = (slug: string, name: string, description: string) =>
    earned.push({ slug, name, description });

  const [albums, artists, songs, following, profile] = await Promise.all([
    supabase
      .from("ratings")
      .select("release_mbid, score, review")
      .eq("user_id", userId)
      .limit(2000),
    supabase
      .from("artist_ratings")
      .select("artist_mbid, score, review")
      .eq("user_id", userId)
      .limit(2000),
    supabase
      .from("song_ratings")
      .select("song_mbid, release_mbid, score")
      .eq("user_id", userId)
      .limit(5000),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
  ]);

  const albumRatings = (albums.data ?? []) as AlbumRating[];
  const artistRatings = (artists.data ?? []) as ArtistRating[];
  const songRatings = (songs.data ?? []) as SongRating[];

  // Who got here early.
  if (profile.data?.created_at) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .lt("created_at", profile.data.created_at);
    if ((count ?? 0) < 100) {
      award("day-ones", "Day Ones", "One of the first hundred people here");
    }
  }

  const reviews =
    albumRatings.filter((r) => r.review?.trim()).length +
    artistRatings.filter((r) => r.review?.trim()).length;
  const tens = [...albumRatings, ...artistRatings, ...songRatings].filter(
    (r) => r.score === 10,
  ).length;

  if (songRatings.length >= 100) {
    award("crate-digger", "Crate Digger", "Rated a hundred songs");
  }
  if (artistRatings.length >= 25) {
    award("a-and-r", "A&R", "Rated twenty-five artists");
  }
  if (reviews >= 10) {
    award("liner-notes", "Liner Notes", "Wrote ten reviews");
  }
  if (tens >= 10) {
    award("certified", "Certified", "Handed out ten perfect scores");
  }
  if ((following.count ?? 0) >= 10) {
    award("the-crew", "The Crew", "Following ten people");
  }

  const ratedAlbums = new Set(albumRatings.map((r) => r.release_mbid));
  const ratedArtists = new Set(artistRatings.map((r) => r.artist_mbid));
  const songScores = new Map(songRatings.map((r) => [r.song_mbid, r.score]));
  const albumsWithSongRatings = new Set(songRatings.map((r) => r.release_mbid));

  // The albums behind those ratings: their dates, and who made them.
  const { data: ratedAlbumRows } =
    ratedAlbums.size > 0
      ? await supabase
          .from("releases")
          .select("mbid, artist_mbid, release_date")
          .in("mbid", [...ratedAlbums].slice(0, ID_LIMIT))
      : { data: [] };

  type ReleaseRow = {
    mbid: string;
    artist_mbid: string | null;
    release_date: string | null;
  };
  const rated = (ratedAlbumRows ?? []) as ReleaseRow[];

  const decades = new Set(
    rated.flatMap((row) => (row.release_date ? [row.release_date.slice(0, 3)] : [])),
  );
  if (decades.size >= 5) {
    award("time-traveller", "Time Traveller", "Rated albums from five different decades");
  }

  // Box Set needs an artist they have rated and five or more of whose albums
  // they have rated; only those are worth asking the catalogue about.
  const ratedPerArtist = new Map<string, number>();
  for (const row of rated) {
    if (row.artist_mbid && ratedArtists.has(row.artist_mbid)) {
      ratedPerArtist.set(
        row.artist_mbid,
        (ratedPerArtist.get(row.artist_mbid) ?? 0) + 1,
      );
    }
  }
  const candidates = [...ratedPerArtist]
    .filter(([, count]) => count >= 5)
    .map(([mbid]) => mbid)
    .slice(0, 20);

  const { data: catalogueRows } =
    candidates.length > 0
      ? await supabase
          .from("releases")
          .select("mbid, artist_mbid")
          .in("artist_mbid", candidates)
      : { data: [] };

  const albumsByArtist = new Map<string, string[]>();
  for (const row of (catalogueRows ?? []) as { mbid: string; artist_mbid: string }[]) {
    albumsByArtist.set(row.artist_mbid, [
      ...(albumsByArtist.get(row.artist_mbid) ?? []),
      row.mbid,
    ]);
  }

  const trackAlbums = [
    ...new Set([
      ...[...albumsByArtist.values()].flat(),
      ...albumsWithSongRatings,
    ]),
  ].slice(0, ID_LIMIT);

  const { data: trackRows } =
    trackAlbums.length > 0
      ? await supabase
          .from("tracks")
          .select("release_mbid, song_mbid")
          .in("release_mbid", trackAlbums)
      : { data: [] };

  const songsByAlbum = new Map<string, string[]>();
  for (const row of (trackRows ?? []) as {
    release_mbid: string;
    song_mbid: string | null;
  }[]) {
    if (!row.song_mbid) continue;
    songsByAlbum.set(row.release_mbid, [
      ...(songsByAlbum.get(row.release_mbid) ?? []),
      row.song_mbid,
    ]);
  }

  // Box Set: the artist, every album of theirs, and every song on them.
  for (const [, albumIds] of albumsByArtist) {
    if (albumIds.length < 5) continue;
    if (!albumIds.every((mbid) => ratedAlbums.has(mbid))) continue;

    const songIds = albumIds.flatMap((mbid) => songsByAlbum.get(mbid) ?? []);
    if (songIds.length < 5) continue;
    if (!songIds.every((mbid) => songScores.has(mbid))) continue;

    award(
      "box-set",
      "Box Set",
      "Rated an artist, every album of theirs and every song on them",
    );
    break;
  }

  // No Skips: an album where every song scored eight or more.
  for (const [albumMbid, songIds] of songsByAlbum) {
    if (songIds.length < 6 || !albumsWithSongRatings.has(albumMbid)) continue;
    if (songIds.every((mbid) => (songScores.get(mbid) ?? 0) >= 8)) {
      award("no-skips", "No Skips", "Gave every song on an album eight or more");
      break;
    }
  }

  return earned;
}
