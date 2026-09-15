import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export type AlbumSummary = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  year: string | null;
};

export type ArtistSummary = {
  mbid: string;
  name: string;
  image_url: string | null;
};

type ReleaseRow = {
  mbid: string;
  title: string;
  artist_credit: string | null;
  cover_art_url: string | null;
  release_date: string | null;
  artists: { name: string } | { name: string }[] | null;
};

const ALBUM_SELECT =
  "mbid, title, artist_credit, cover_art_url, release_date, artists ( name )";

function toAlbum(row: ReleaseRow): AlbumSummary {
  const joined = Array.isArray(row.artists) ? row.artists[0] : row.artists;
  return {
    mbid: row.mbid,
    title: row.title,
    artist: row.artist_credit ?? joined?.name ?? null,
    cover_art_url: row.cover_art_url,
    year: row.release_date?.slice(0, 4) ?? null,
  };
}

/** The albums people listen to most, by ListenBrainz listen counts. */
export async function mostPlayedAlbums(limit = 15): Promise<AlbumSummary[]> {
  const { data } = await createPublicClient()
    .from("releases")
    .select(ALBUM_SELECT)
    .not("popularity", "is", null)
    .neq("cover_art_url", "")
    .order("popularity", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as ReleaseRow[]).map(toAlbum);
}

/** Well-known artists with a photo, most-played first. */
export async function popularArtists(limit = 10): Promise<ArtistSummary[]> {
  const { data } = await createPublicClient()
    .from("artists")
    .select("mbid, name, image_url")
    .not("popularity", "is", null)
    .neq("image_url", "")
    .order("popularity", { ascending: false })
    .limit(limit);

  return (data ?? []) as ArtistSummary[];
}

/**
 * The best average scores from people's ratings on MULO. Averaging in code is
 * fine at soft-launch scale; past a few thousand ratings this belongs in a
 * database view.
 */
export async function topRatedOnMulo(
  limit = 10,
): Promise<(AlbumSummary & { average: number; count: number })[]> {
  const supabase = createPublicClient();
  const { data: ratings } = await supabase
    .from("ratings")
    .select("release_mbid, score")
    .limit(5000);

  const totals = new Map<string, { sum: number; count: number }>();
  for (const rating of ratings ?? []) {
    const total = totals.get(rating.release_mbid) ?? { sum: 0, count: 0 };
    total.sum += rating.score;
    total.count += 1;
    totals.set(rating.release_mbid, total);
  }

  const ranked = [...totals.entries()]
    .map(([mbid, t]) => ({ mbid, average: t.sum / t.count, count: t.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data: rows } = await supabase
    .from("releases")
    .select(ALBUM_SELECT)
    .in("mbid", ranked.map((r) => r.mbid));

  const albums = new Map(
    ((rows ?? []) as unknown as ReleaseRow[]).map((row) => [row.mbid, toAlbum(row)]),
  );

  return ranked.flatMap((r) => {
    const album = albums.get(r.mbid);
    return album ? [{ ...album, average: r.average, count: r.count }] : [];
  });
}
