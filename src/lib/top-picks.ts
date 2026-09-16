import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";

export type PickKind = "artist" | "album";

/** One entry in somebody's ranked top ten, ready to render. */
export type TopPick = {
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
};

type ArtistRow = {
  position: number;
  artists: { mbid: string; name: string; image_url: string | null };
};

type AlbumRow = {
  position: number;
  releases: {
    mbid: string;
    title: string;
    artist_credit: string | null;
    cover_art_url: string | null;
    artists: { name: string } | null;
  };
};

const ARTIST_SELECT = "position, artists!inner ( mbid, name, image_url )";
const ALBUM_SELECT =
  "position, releases!inner ( mbid, title, artist_credit, cover_art_url, artists ( name ) )";

function toArtistPick(row: ArtistRow): TopPick {
  return {
    mbid: row.artists.mbid,
    title: row.artists.name,
    subtitle: null,
    image: artistPhotoSrc(row.artists.image_url, 300),
  };
}

function toAlbumPick(row: AlbumRow): TopPick {
  return {
    mbid: row.releases.mbid,
    title: row.releases.title,
    subtitle: row.releases.artist_credit ?? row.releases.artists?.name ?? null,
    image: coverSrc(row.releases.cover_art_url, 250),
  };
}

/** Somebody's ranked list, best first. */
export async function getTopPicks(
  userId: string,
  kind: PickKind,
): Promise<TopPick[]> {
  const supabase = await createClient();

  if (kind === "artist") {
    const { data } = await supabase
      .from("top_artists")
      .select(ARTIST_SELECT)
      .eq("user_id", userId)
      .order("position");

    return ((data ?? []) as unknown as ArtistRow[]).map(toArtistPick);
  }

  const { data } = await supabase
    .from("top_albums")
    .select(ALBUM_SELECT)
    .eq("user_id", userId)
    .order("position");

  return ((data ?? []) as unknown as AlbumRow[]).map(toAlbumPick);
}

/** The same list for the share picture, which runs without a session. */
export async function getPublicTopPicks(
  userId: string,
  kind: PickKind,
): Promise<TopPick[]> {
  const supabase = createPublicClient();

  if (kind === "artist") {
    const { data } = await supabase
      .from("top_artists")
      .select(ARTIST_SELECT)
      .eq("user_id", userId)
      .order("position");

    return ((data ?? []) as unknown as ArtistRow[]).map(toArtistPick);
  }

  const { data } = await supabase
    .from("top_albums")
    .select(ALBUM_SELECT)
    .eq("user_id", userId)
    .order("position");

  return ((data ?? []) as unknown as AlbumRow[]).map(toAlbumPick);
}

/**
 * A starting shortlist for the picker: what this person has rated highest,
 * topped up with well-known names so a new account has something to pick from.
 */
export async function getPickSuggestions(
  userId: string,
  kind: PickKind,
  limit = 12,
): Promise<TopPick[]> {
  const supabase = await createClient();

  const rated =
    kind === "artist"
      ? await supabase
          .from("artist_ratings")
          .select("score, artists!inner ( mbid, name, image_url )")
          .eq("user_id", userId)
          .order("score", { ascending: false })
          .limit(limit)
      : await supabase
          .from("ratings")
          .select(
            "score, releases!inner ( mbid, title, artist_credit, cover_art_url, artists ( name ) )",
          )
          .eq("user_id", userId)
          .order("score", { ascending: false })
          .limit(limit);

  const picks =
    kind === "artist"
      ? ((rated.data ?? []) as unknown as ArtistRow[]).map(toArtistPick)
      : ((rated.data ?? []) as unknown as AlbumRow[]).map(toAlbumPick);

  if (picks.length >= limit) return picks;

  // Top up with the most-played names in the catalogue.
  const seen = new Set(picks.map((p) => p.mbid));
  const publicClient = createPublicClient();

  if (kind === "artist") {
    const { data } = await publicClient
      .from("artists")
      .select("mbid, name, image_url")
      .not("popularity", "is", null)
      .neq("image_url", "")
      .order("popularity", { ascending: false })
      .limit(limit * 2);

    for (const row of (data ?? []) as ArtistRow["artists"][]) {
      if (picks.length >= limit) break;
      if (seen.has(row.mbid)) continue;
      picks.push({
        mbid: row.mbid,
        title: row.name,
        subtitle: null,
        image: artistPhotoSrc(row.image_url, 300),
      });
    }

    return picks;
  }

  const { data } = await publicClient
    .from("releases")
    .select("mbid, title, artist_credit, cover_art_url, artists ( name )")
    .not("popularity", "is", null)
    .neq("cover_art_url", "")
    .order("popularity", { ascending: false })
    .limit(limit * 2);

  for (const row of (data ?? []) as unknown as AlbumRow["releases"][]) {
    if (picks.length >= limit) break;
    if (seen.has(row.mbid)) continue;
    picks.push(toAlbumPick({ position: 0, releases: row }));
  }

  return picks;
}
