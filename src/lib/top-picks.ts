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

export type PickSuggestions = {
  /** "rated": their own ratings, best first. "popular": a start for new accounts. */
  source: "rated" | "popular";
  picks: (TopPick & { score: number | null })[];
};

const RATED_LIMIT = 100;
const POPULAR_LIMIT = 12;

/**
 * What the picker offers. Anyone who has rated artists (or albums) sees every
 * one of them, highest score first, since their GOAT is almost certainly in
 * there. Anyone who hasn't gets well-known names to start from.
 */
export async function getPickSuggestions(
  userId: string,
  kind: PickKind,
): Promise<PickSuggestions> {
  const supabase = await createClient();
  const best = { ascending: false } as const;

  if (kind === "artist") {
    const { data } = await supabase
      .from("artist_ratings")
      .select("score, artists!inner ( mbid, name, image_url )")
      .eq("user_id", userId)
      .order("score", best)
      .order("created_at", best)
      .limit(RATED_LIMIT);

    const rated = (data ?? []) as unknown as {
      score: number;
      artists: ArtistRow["artists"];
    }[];

    if (rated.length > 0) {
      return {
        source: "rated",
        picks: rated.map((row) => ({
          ...toArtistPick({ position: 0, artists: row.artists }),
          score: row.score,
        })),
      };
    }

    const { data: popular } = await createPublicClient()
      .from("artists")
      .select("mbid, name, image_url")
      .not("popularity", "is", null)
      .neq("image_url", "")
      .order("popularity", best)
      .limit(POPULAR_LIMIT);

    return {
      source: "popular",
      picks: ((popular ?? []) as ArtistRow["artists"][]).map((artist) => ({
        ...toArtistPick({ position: 0, artists: artist }),
        score: null,
      })),
    };
  }

  const { data } = await supabase
    .from("ratings")
    .select(
      "score, releases!inner ( mbid, title, artist_credit, cover_art_url, artists ( name ) )",
    )
    .eq("user_id", userId)
    .order("score", best)
    .order("created_at", best)
    .limit(RATED_LIMIT);

  const rated = (data ?? []) as unknown as {
    score: number;
    releases: AlbumRow["releases"];
  }[];

  if (rated.length > 0) {
    return {
      source: "rated",
      picks: rated.map((row) => ({
        ...toAlbumPick({ position: 0, releases: row.releases }),
        score: row.score,
      })),
    };
  }

  const { data: popular } = await createPublicClient()
    .from("releases")
    .select("mbid, title, artist_credit, cover_art_url, artists ( name )")
    .not("popularity", "is", null)
    .neq("cover_art_url", "")
    .order("popularity", best)
    .limit(POPULAR_LIMIT);

  return {
    source: "popular",
    picks: ((popular ?? []) as unknown as AlbumRow["releases"][]).map((release) => ({
      ...toAlbumPick({ position: 0, releases: release }),
      score: null,
    })),
  };
}
