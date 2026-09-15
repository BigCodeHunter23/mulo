import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getFollowingIds } from "@/lib/social";

type Author = { username: string; display_name: string | null; avatar_url: string | null };

export type FeedAlbum = {
  mbid: string;
  title: string;
  cover_art_url: string | null;
  artist: { mbid: string; name: string } | null;
};

export type FeedItem =
  | {
      kind: "album";
      key: string;
      created_at: string;
      author: Author;
      score: number;
      review: string | null;
      release: FeedAlbum;
    }
  | {
      kind: "artist";
      key: string;
      created_at: string;
      author: Author;
      score: number;
      review: string | null;
      artist: { mbid: string; name: string; image_url: string | null };
    }
  | {
      kind: "songs";
      key: string;
      created_at: string;
      author: Author;
      release: FeedAlbum;
      /** Newest first. */
      songs: { title: string; score: number }[];
    };

type ReleaseRow = {
  mbid: string;
  title: string;
  cover_art_url: string | null;
  artists: { mbid: string; name: string } | null;
};

type AlbumRow = {
  id: number;
  score: number;
  review: string | null;
  created_at: string;
  profiles: Author;
  releases: ReleaseRow;
};

type ArtistRow = {
  id: number;
  score: number;
  review: string | null;
  created_at: string;
  profiles: Author;
  artists: { mbid: string; name: string; image_url: string | null };
};

type SongRow = {
  user_id: string;
  score: number;
  created_at: string;
  profiles: Author;
  songs: { title: string };
  releases: ReleaseRow;
};

const AUTHOR = "profiles!inner ( username, display_name, avatar_url )";
const RELEASE = "releases!inner ( mbid, title, cover_art_url, artists ( mbid, name ) )";

function toAlbum(row: ReleaseRow): FeedAlbum {
  return {
    mbid: row.mbid,
    title: row.title,
    cover_art_url: row.cover_art_url,
    artist: row.artists,
  };
}

/**
 * Songs get rated in bursts, often a whole album at once, so one person's
 * ratings of songs from one album fold into a single item.
 */
function groupSongs(rows: SongRow[]): FeedItem[] {
  const groups = new Map<string, Extract<FeedItem, { kind: "songs" }>>();

  for (const row of rows) {
    const key = `songs-${row.user_id}-${row.releases.mbid}`;
    const song = { title: row.songs.title, score: row.score };
    const group = groups.get(key);

    if (group) group.songs.push(song);
    else {
      groups.set(key, {
        kind: "songs",
        key,
        created_at: row.created_at,
        author: row.profiles,
        release: toAlbum(row.releases),
        songs: [song],
      });
    }
  }

  return [...groups.values()];
}

/**
 * Recent album, artist and song ratings, newest first, from the given people
 * or from everyone. Plain queries, not a fan-out table: at this scale that
 * would be needless machinery.
 */
async function loadFeed(userIds: string[] | null, limit: number): Promise<FeedItem[]> {
  const supabase = await createClient();
  const newest = { ascending: false } as const;

  const albums = supabase
    .from("ratings")
    .select(`id, score, review, created_at, ${AUTHOR}, ${RELEASE}`)
    .order("created_at", newest)
    .limit(limit);

  const artists = supabase
    .from("artist_ratings")
    .select(`id, score, review, created_at, ${AUTHOR}, artists!inner ( mbid, name, image_url )`)
    .order("created_at", newest)
    .limit(limit);

  // Read further back for songs, since many of them fold into one item.
  const songs = supabase
    .from("song_ratings")
    .select(`user_id, score, created_at, ${AUTHOR}, songs!inner ( title ), ${RELEASE}`)
    .order("created_at", newest)
    .limit(limit * 10);

  if (userIds) {
    albums.in("user_id", userIds);
    artists.in("user_id", userIds);
    songs.in("user_id", userIds);
  }

  const [albumResult, artistResult, songResult] = await Promise.all([
    albums,
    artists,
    songs,
  ]);

  const items: FeedItem[] = [
    ...((albumResult.data ?? []) as unknown as AlbumRow[]).map(
      (row): FeedItem => ({
        kind: "album",
        key: `album-${row.id}`,
        created_at: row.created_at,
        author: row.profiles,
        score: row.score,
        review: row.review,
        release: toAlbum(row.releases),
      }),
    ),
    ...((artistResult.data ?? []) as unknown as ArtistRow[]).map(
      (row): FeedItem => ({
        kind: "artist",
        key: `artist-${row.id}`,
        created_at: row.created_at,
        author: row.profiles,
        score: row.score,
        review: row.review,
        artist: row.artists,
      }),
    ),
    ...groupSongs((songResult.data ?? []) as unknown as SongRow[]),
  ];

  return items
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
}

/** Ratings from the people a user follows. */
export async function getFollowingFeed(
  userId: string,
  limit = 50,
): Promise<FeedItem[]> {
  const followingIds = await getFollowingIds(userId);
  if (followingIds.length === 0) return [];
  return loadFeed(followingIds, limit);
}

/** Recent activity across everyone, so a new account has something to read. */
export async function getGlobalFeed(limit = 30): Promise<FeedItem[]> {
  return loadFeed(null, limit);
}

/** Everything one person has rated, for their public profile. */
export async function getUserFeed(
  userId: string,
  limit = 50,
): Promise<FeedItem[]> {
  return loadFeed([userId], limit);
}
