import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";

export type MixtapePick = {
  key: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
  score: number;
};

export type Mixtape = {
  /** "2026-09" */
  month: string;
  /** "September 2026" */
  label: string;
  albums: number;
  songs: number;
  artists: number;
  average: number | null;
  topAlbum: MixtapePick | null;
  topSong: MixtapePick | null;
  topArtist: (MixtapePick & { rated: number }) | null;
  /** The best of the month, across all three, highest first. */
  highlights: MixtapePick[];
};

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function shiftMonth(month: string, months: number) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + months, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type ArtistRef = { mbid: string; name: string; image_url: string | null };

type ReleaseRef = {
  mbid: string;
  title: string;
  artist_credit: string | null;
  cover_art_url: string | null;
  artist_mbid: string | null;
  artists: ArtistRef | null;
};

type AlbumRow = { score: number; releases: ReleaseRef };
type SongRow = { score: number; songs: { mbid: string; title: string }; releases: ReleaseRef };
type ArtistRow = { score: number; artists: ArtistRef };

const RELEASE =
  "releases!inner ( mbid, title, artist_credit, cover_art_url, artist_mbid, artists ( mbid, name, image_url ) )";

function creditOf(release: ReleaseRef) {
  return release.artist_credit ?? release.artists?.name ?? null;
}

/**
 * One month of somebody's ratings, laid out like a tape: what they scored
 * highest, and whose music they kept coming back to. Dates are when a rating
 * was first made, so changing a score later doesn't move it to another month.
 */
async function load(
  supabase: SupabaseClient,
  userId: string,
  month: string,
): Promise<Mixtape> {
  const start = `${month}-01T00:00:00Z`;
  const end = `${shiftMonth(month, 1)}-01T00:00:00Z`;
  const highest = { ascending: false } as const;

  const [albumResult, songResult, artistResult] = await Promise.all([
    supabase
      .from("ratings")
      .select(`score, ${RELEASE}`)
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("score", highest)
      .limit(200),
    supabase
      .from("song_ratings")
      .select(`score, songs!inner ( mbid, title ), ${RELEASE}`)
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("score", highest)
      .limit(500),
    supabase
      .from("artist_ratings")
      .select("score, artists!inner ( mbid, name, image_url )")
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("score", highest)
      .limit(200),
  ]);

  const albumRows = (albumResult.data ?? []) as unknown as AlbumRow[];
  const songRows = (songResult.data ?? []) as unknown as SongRow[];
  const artistRows = (artistResult.data ?? []) as unknown as ArtistRow[];

  const albumPicks: MixtapePick[] = albumRows.map((row) => ({
    key: `album-${row.releases.mbid}`,
    title: row.releases.title,
    subtitle: creditOf(row.releases),
    image: coverSrc(row.releases.cover_art_url, 250),
    href: `/album/${row.releases.mbid}`,
    score: row.score,
  }));

  const songPicks: MixtapePick[] = songRows.map((row) => ({
    key: `song-${row.songs.mbid}`,
    title: row.songs.title,
    subtitle: row.releases.title,
    image: coverSrc(row.releases.cover_art_url, 250),
    href: `/album/${row.releases.mbid}`,
    score: row.score,
  }));

  const artistPicks: MixtapePick[] = artistRows.map((row) => ({
    key: `artist-${row.artists.mbid}`,
    title: row.artists.name,
    subtitle: null,
    image: artistPhotoSrc(row.artists.image_url, 300),
    href: `/artist/${row.artists.mbid}`,
    score: row.score,
  }));

  // Whose music they rated most this month, albums and songs together.
  const tally = new Map<string, { artist: ArtistRef; rated: number }>();
  for (const row of [...albumRows, ...songRows]) {
    const artist = row.releases.artists;
    if (!artist) continue;
    const entry = tally.get(artist.mbid) ?? { artist, rated: 0 };
    entry.rated += 1;
    tally.set(artist.mbid, entry);
  }
  const busiest = [...tally.values()].sort((a, b) => b.rated - a.rated)[0];

  const scores = [
    ...albumRows.map((r) => r.score),
    ...songRows.map((r) => r.score),
    ...artistRows.map((r) => r.score),
  ];

  return {
    month,
    label: monthLabel(month),
    albums: albumRows.length,
    songs: songRows.length,
    artists: artistRows.length,
    average:
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null,
    topAlbum: albumPicks[0] ?? null,
    topSong: songPicks[0] ?? null,
    topArtist:
      busiest && busiest.rated > 1
        ? {
            key: `artist-${busiest.artist.mbid}`,
            title: busiest.artist.name,
            subtitle: null,
            image: artistPhotoSrc(busiest.artist.image_url, 300),
            href: `/artist/${busiest.artist.mbid}`,
            score:
              artistPicks.find((p) => p.key === `artist-${busiest.artist.mbid}`)
                ?.score ?? 0,
            rated: busiest.rated,
          }
        : null,
    highlights: [...albumPicks, ...songPicks, ...artistPicks]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12),
  };
}

export async function getMixtape(userId: string, month: string) {
  return load(await createClient(), userId, month);
}

/** The same month for the share picture, which runs without a session. */
export async function getPublicMixtape(userId: string, month: string) {
  return load(createPublicClient(), userId, month);
}
