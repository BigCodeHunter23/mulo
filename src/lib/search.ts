import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export type SearchArtist = {
  mbid: string;
  name: string;
  image_url: string | null;
};

export type SearchAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  year: string | null;
};

export type SearchSong = {
  mbid: string;
  title: string;
  album: string;
  albumMbid: string;
  artist: string | null;
  cover_art_url: string | null;
};

export type SearchResults = {
  artists: SearchArtist[];
  albums: SearchAlbum[];
  songs: SearchSong[];
};

type SongRow = {
  title: string;
  song_mbid: string;
  releases: {
    mbid: string;
    title: string;
    artist_credit: string | null;
    cover_art_url: string | null;
    popularity: number | null;
    artists: { name: string } | { name: string }[] | null;
  };
};

type ArtistRow = SearchArtist & {
  search_names: string | null;
  popularity: number | null;
};

type AlbumRow = {
  mbid: string;
  title: string;
  artist_credit: string | null;
  artist_mbid: string | null;
  cover_art_url: string | null;
  release_date: string | null;
  popularity: number | null;
  artists: { name: string } | { name: string }[] | null;
};

const ALBUM_COLUMNS =
  "mbid, title, artist_credit, artist_mbid, cover_art_url, release_date, popularity, artists ( name )";

/**
 * A substring pattern for PostgREST, quoted so commas, brackets and
 * apostrophes in names ("D'Angelo", "Mr. Morale") don't break the filter.
 */
function pattern(query: string) {
  const value = query.replace(/[*%_]/g, " ").replace(/["\\]/g, "\\$&");
  return `"*${value}*"`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 0 exact, 1 starts with, 2 starts a word, 3 appears somewhere. */
function matchRank(text: string | null | undefined, query: string) {
  if (!text) return 9;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(t)) return 2;
  return t.includes(q) ? 3 : 9;
}

function joinedName(row: AlbumRow) {
  const joined = Array.isArray(row.artists) ? row.artists[0] : row.artists;
  return joined?.name ?? null;
}

/**
 * Searches MULO's own catalogue: instant, and never "busy" the way
 * MusicBrainz's search is. Close matches come first; among equally close
 * matches, the more-played record wins.
 */
export async function searchCatalog(
  rawQuery: string,
  limit = 8,
): Promise<SearchResults> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return { artists: [], albums: [], songs: [] };

  const supabase = createPublicClient();
  const like = pattern(query);

  const [artistResult, albumResult, songResult] = await Promise.all([
    supabase
      .from("artists")
      .select("mbid, name, image_url, search_names, popularity")
      .or(`name.ilike.${like},search_names.ilike.${like}`)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from("releases")
      .select(ALBUM_COLUMNS)
      .or(`title.ilike.${like},artist_credit.ilike.${like}`)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(60),
    // Songs are found through the tracklists they sit on, which carry the
    // album and its cover.
    supabase
      .from("tracks")
      .select(
        "title, song_mbid, releases!inner ( mbid, title, artist_credit, cover_art_url, popularity, artists ( name ) )",
      )
      .ilike("title", `*${query.replace(/[*%_]/g, " ")}*`)
      .not("song_mbid", "is", null)
      .limit(80),
  ]);

  const artists = ((artistResult.data ?? []) as ArtistRow[])
    .map((row) => ({
      row,
      // An alias match counts for slightly less than the artist's own name.
      rank: Math.min(
        matchRank(row.name, query),
        ...(row.search_names ?? "")
          .split(" | ")
          .map((name) => matchRank(name, query) + 0.5),
      ),
    }))
    .sort((a, b) => a.rank - b.rank || (b.row.popularity ?? 0) - (a.row.popularity ?? 0));

  // Searching an artist's name should also surface their best-known albums,
  // including ones cached before the printed artist credit was recorded.
  const strongArtists = artists
    .filter((a) => a.rank <= 1.5)
    .slice(0, 3)
    .map((a) => a.row.mbid);

  const byArtist = strongArtists.length
    ? await supabase
        .from("releases")
        .select(ALBUM_COLUMNS)
        .in("artist_mbid", strongArtists)
        .order("popularity", { ascending: false, nullsFirst: false })
        .limit(12)
    : { data: [] };

  const seen = new Set<string>();
  const albums = [
    ...((albumResult.data ?? []) as unknown as AlbumRow[]),
    ...((byArtist.data ?? []) as unknown as AlbumRow[]),
  ]
    .filter((row) => (seen.has(row.mbid) ? false : (seen.add(row.mbid), true)))
    .map((row) => ({
      row,
      // A title match and an artist match count the same, so "kanye" puts
      // Kanye West's most-played albums ahead of an obscure record that just
      // has "Kanye" in its name. Listen counts decide between equal matches.
      rank: Math.min(
        matchRank(row.title, query),
        matchRank(row.artist_credit ?? joinedName(row), query),
        strongArtists.includes(row.artist_mbid ?? "") ? 1 : 9,
      ),
    }))
    .sort((a, b) => a.rank - b.rank || (b.row.popularity ?? 0) - (a.row.popularity ?? 0));

  // A song can sit on more than one album; keep its best-known one.
  const bestSongs = new Map<string, { row: SongRow; rank: number }>();
  for (const row of (songResult.data ?? []) as unknown as SongRow[]) {
    const rank = matchRank(row.title, query);
    const current = bestSongs.get(row.song_mbid);
    const morePopular =
      (row.releases.popularity ?? 0) > (current?.row.releases.popularity ?? 0);
    if (!current || rank < current.rank || (rank === current.rank && morePopular)) {
      bestSongs.set(row.song_mbid, { row, rank });
    }
  }
  const songs = [...bestSongs.values()].sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.row.releases.popularity ?? 0) - (a.row.releases.popularity ?? 0),
  );

  return {
    songs: songs.slice(0, limit).map(({ row }) => {
      const joined = Array.isArray(row.releases.artists)
        ? row.releases.artists[0]
        : row.releases.artists;
      return {
        mbid: row.song_mbid,
        title: row.title,
        album: row.releases.title,
        albumMbid: row.releases.mbid,
        artist: row.releases.artist_credit ?? joined?.name ?? null,
        cover_art_url: row.releases.cover_art_url || null,
      };
    }),
    artists: artists.slice(0, limit).map(({ row }) => ({
      mbid: row.mbid,
      name: row.name,
      image_url: row.image_url || null,
    })),
    albums: albums.slice(0, limit).map(({ row }) => ({
      mbid: row.mbid,
      title: row.title,
      artist: row.artist_credit ?? joinedName(row),
      cover_art_url: row.cover_art_url || null,
      year: row.release_date?.slice(0, 4) ?? null,
    })),
  };
}
