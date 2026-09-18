import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCachedArtistAlbums } from "@/lib/catalog";
import { hitsForAlbums, type StackAlbum } from "@/lib/stack";

/**
 * The Gauntlet: an artist's whole discography, rated in one run, and what
 * comes out the other end — one person's ranking of every album they made.
 *
 * "My Kendrick ranking" is one of the most argued-over things in music, and
 * it's the kind of list people post. Everything here is read from ordinary
 * album ratings, so a Gauntlet run and rating albums one page at a time end in
 * exactly the same place.
 */

export type RankedAlbum = {
  mbid: string;
  title: string;
  year: string | null;
  cover: string | null;
  score: number;
};

export type SetProgress = {
  total: number;
  rated: number;
  /** The albums still to rate, oldest first, for a run. */
  remaining: string[];
};

/** How many of an artist's albums somebody has rated. */
export async function getSetProgress(
  userId: string,
  albumMbids: string[],
): Promise<SetProgress> {
  if (albumMbids.length === 0) return { total: 0, rated: 0, remaining: [] };

  const supabase = await createClient();
  const { data } = await supabase
    .from("ratings")
    .select("release_mbid")
    .eq("user_id", userId)
    .in("release_mbid", albumMbids);

  const done = new Set((data ?? []).map((row) => row.release_mbid as string));
  return {
    total: albumMbids.length,
    rated: done.size,
    remaining: albumMbids.filter((mbid) => !done.has(mbid)),
  };
}

/** The albums a Gauntlet run still has to get through, as Stack cards. */
export async function getGauntletRun(
  userId: string,
  artistMbid: string,
  /** Shown on each card, and what the song previews search Apple with. */
  artistName: string,
): Promise<{ run: StackAlbum[]; total: number }> {
  const albums = await getCachedArtistAlbums(artistMbid);
  const progress = await getSetProgress(
    userId,
    albums.map((album) => album.mbid),
  );

  // Oldest first: a discography reads best in the order it was made.
  const todo = albums
    .filter((album) => progress.remaining.includes(album.mbid))
    .sort((a, b) => (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999"));

  const hits = await hitsForAlbums(todo.map((album) => album.mbid));

  return {
    total: albums.length,
    run: todo.map((album, i) => {
      const found = hits.get(album.mbid) ?? { hits: [], byPlays: false };
      return {
        mbid: album.mbid,
        title: album.title,
        artist: artistName,
        cover: album.cover_art_url,
        year: album.release_date?.slice(0, 4) ?? null,
        reason: `Album ${progress.rated + i + 1} of ${albums.length}`,
        hits: found.hits,
        hitsByPlays: found.byPlays,
      };
    }),
  };
}

/** One person's ranking of an artist's albums, best first. */
export async function getRanking(
  userId: string,
  artistMbid: string,
): Promise<{ ranked: RankedAlbum[]; total: number }> {
  const albums = await getCachedArtistAlbums(artistMbid);
  if (albums.length === 0) return { ranked: [], total: 0 };

  const supabase = await createClient();
  const { data } = await supabase
    .from("ratings")
    .select("release_mbid, score, updated_at")
    .eq("user_id", userId)
    .in(
      "release_mbid",
      albums.map((album) => album.mbid),
    );

  const scores = new Map(
    ((data ?? []) as { release_mbid: string; score: number }[]).map((row) => [
      row.release_mbid,
      row.score,
    ]),
  );

  const ranked = albums
    .filter((album) => scores.has(album.mbid))
    .map((album) => ({
      mbid: album.mbid,
      title: album.title,
      year: album.release_date?.slice(0, 4) ?? null,
      cover: album.cover_art_url,
      score: scores.get(album.mbid)!,
    }))
    // Best first; a tie goes to the older record, as the one that had to
    // hold its place for longer.
    .sort(
      (a, b) => b.score - a.score || (a.year ?? "9999").localeCompare(b.year ?? "9999"),
    );

  return { ranked, total: albums.length };
}
