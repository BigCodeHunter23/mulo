import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getFollowingIds } from "@/lib/social";
import { getReactions, NO_REACTIONS, type ReactionSummary } from "@/lib/reactions";
import { MATCHUP_SELECT, sydneyDay, toMatchup, type MatchupRow } from "@/lib/versus";
import type { VersusMatchup, VersusSideKey } from "@/lib/versus-shared";

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
      /** The rating itself, which is what a love or a nah attaches to. */
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      score: number;
      review: string | null;
      release: FeedAlbum;
    }
  | {
      kind: "artist";
      key: string;
      ratingId: number;
      reaction: ReactionSummary;
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
    }
  | {
      kind: "pick";
      key: string;
      /** The pick itself, which is what a love or a nah attaches to. */
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      matchup: VersusMatchup;
      pick: VersusSideKey;
      /** Hidden until the viewer has picked too, or the matchup has closed. */
      revealed: boolean;
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

type PickRow = {
  id: number;
  pick: VersusSideKey;
  created_at: string;
  profiles: Author;
  versus_matchups: MatchupRow;
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
 * would be needless machinery. Given a viewer, their friends' Daily Versus
 * picks come in too.
 */
async function loadFeed(
  userIds: string[] | null,
  limit: number,
  viewerId: string | null = null,
): Promise<FeedItem[]> {
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

  // Before picks can take reactions they have no id, and this reads nothing.
  const picks =
    viewerId && userIds
      ? supabase
          .from("versus_votes")
          .select(`id, pick, created_at, ${AUTHOR}, versus_matchups!inner ( ${MATCHUP_SELECT} )`)
          .in("user_id", userIds)
          .order("created_at", newest)
          .limit(limit)
      : Promise.resolve({ data: null });

  const [albumResult, artistResult, songResult, pickResult] = await Promise.all([
    albums,
    artists,
    songs,
    picks,
  ]);

  const items: FeedItem[] = [
    ...((albumResult.data ?? []) as unknown as AlbumRow[]).map(
      (row): FeedItem => ({
        kind: "album",
        key: `album-${row.id}`,
        ratingId: row.id,
        reaction: NO_REACTIONS,
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
        ratingId: row.id,
        reaction: NO_REACTIONS,
        created_at: row.created_at,
        author: row.profiles,
        score: row.score,
        review: row.review,
        artist: row.artists,
      }),
    ),
    ...groupSongs((songResult.data ?? []) as unknown as SongRow[]),
    ...((pickResult.data ?? []) as unknown as PickRow[]).map(
      (row): FeedItem => ({
        kind: "pick",
        key: `pick-${row.id}`,
        ratingId: row.id,
        reaction: NO_REACTIONS,
        created_at: row.created_at,
        author: row.profiles,
        matchup: toMatchup(row.versus_matchups),
        pick: row.pick,
        revealed: false,
      }),
    ),
  ];

  const visible = items
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);

  const pickItems = visible.flatMap((item) => (item.kind === "pick" ? [item] : []));
  const pickMatchups = [...new Set(pickItems.map((item) => item.matchup.id))];

  // Loves and nahs, for the items that made the cut, and which matchups the
  // viewer has picked in themselves.
  const [albumReactions, artistReactions, pickReactions, viewerPicks] = await Promise.all([
    getReactions(
      "album",
      visible.flatMap((item) => (item.kind === "album" ? [item.ratingId] : [])),
    ),
    getReactions(
      "artist",
      visible.flatMap((item) => (item.kind === "artist" ? [item.ratingId] : [])),
    ),
    getReactions(
      "pick",
      pickItems.map((item) => item.ratingId),
    ),
    viewerId && pickMatchups.length > 0
      ? supabase
          .from("versus_votes")
          .select("matchup_id")
          .eq("user_id", viewerId)
          .in("matchup_id", pickMatchups)
      : Promise.resolve({ data: [] }),
  ]);

  const pickedIn = new Set(
    ((viewerPicks.data ?? []) as { matchup_id: number }[]).map((row) => row.matchup_id),
  );
  const today = sydneyDay();

  return visible.map((item) => {
    if (item.kind === "album") {
      return { ...item, reaction: albumReactions[item.ratingId] ?? NO_REACTIONS };
    }
    if (item.kind === "artist") {
      return { ...item, reaction: artistReactions[item.ratingId] ?? NO_REACTIONS };
    }
    if (item.kind === "pick") {
      return {
        ...item,
        reaction: pickReactions[item.ratingId] ?? NO_REACTIONS,
        revealed: item.matchup.day < today || pickedIn.has(item.matchup.id),
      };
    }
    return item;
  });
}

/** Ratings from the people a user follows. */
export async function getFollowingFeed(
  userId: string,
  limit = 50,
): Promise<FeedItem[]> {
  const followingIds = await getFollowingIds(userId);
  if (followingIds.length === 0) return [];
  return loadFeed(followingIds, limit, userId);
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
