import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  coverArtUrl,
  getArtist,
  getArtistReleaseGroups,
  getReleaseGroup,
  getTracklist,
} from "@/lib/musicbrainz";

export type Artist = {
  mbid: string;
  name: string;
  image_url: string | null;
  bio: string | null;
};

export type Release = {
  mbid: string;
  title: string;
  artist_mbid: string | null;
  release_date: string | null;
  cover_art_url: string | null;
  genres: string[];
};

export type Track = {
  position: number;
  title: string;
  duration_ms: number | null;
};

export async function getCachedArtist(mbid: string): Promise<Artist | null> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("artists")
    .select("mbid, name, image_url, bio")
    .eq("mbid", mbid)
    .single();

  if (cached) return cached;

  const mb = await getArtist(mbid);
  const artist: Artist = {
    mbid: mb.id,
    name: mb.name,
    image_url: null,
    bio: mb.disambiguation || null,
  };

  await createAdminClient().from("artists").upsert(artist);

  return artist;
}

export async function getCachedArtistAlbums(
  artistMbid: string,
): Promise<Release[]> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("releases")
    .select("mbid, title, artist_mbid, release_date, cover_art_url, genres")
    .eq("artist_mbid", artistMbid)
    .order("release_date", { ascending: false });

  if (cached && cached.length > 0) return cached;

  const groups = await getArtistReleaseGroups(artistMbid);
  const releases: Release[] = groups.map((g) => ({
    mbid: g.id,
    title: g.title,
    artist_mbid: artistMbid,
    release_date: g["first-release-date"] || null,
    cover_art_url: coverArtUrl(g.id),
    genres: [],
  }));

  if (releases.length > 0) {
    await createAdminClient().from("releases").upsert(releases);
  }

  return releases.sort((a, b) =>
    (b.release_date ?? "").localeCompare(a.release_date ?? ""),
  );
}

export async function getCachedRelease(mbid: string): Promise<Release | null> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("releases")
    .select("mbid, title, artist_mbid, release_date, cover_art_url, genres")
    .eq("mbid", mbid)
    .single();

  if (cached && cached.genres.length > 0) return cached;

  const mb = await getReleaseGroup(mbid);
  const artistCredit = mb["artist-credit"]?.[0]?.artist;

  if (artistCredit) {
    await createAdminClient()
      .from("artists")
      .upsert({ mbid: artistCredit.id, name: artistCredit.name });
  }

  const release: Release = {
    mbid: mb.id,
    title: mb.title,
    artist_mbid: artistCredit?.id ?? null,
    release_date: mb["first-release-date"] || null,
    cover_art_url: coverArtUrl(mb.id),
    genres: (mb.genres ?? []).map((g) => g.name),
  };

  await createAdminClient().from("releases").upsert(release);

  return release;
}

export async function getCachedTracks(releaseMbid: string): Promise<Track[]> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("tracks")
    .select("position, title, duration_ms")
    .eq("release_mbid", releaseMbid)
    .order("position");

  if (cached && cached.length > 0) return cached;

  const mbTracks = await getTracklist(releaseMbid);
  const tracks = mbTracks.map((t) => ({
    position: t.position,
    title: t.title,
    duration_ms: t.length ?? null,
  }));

  if (tracks.length > 0) {
    await createAdminClient()
      .from("tracks")
      .insert(tracks.map((t) => ({ ...t, release_mbid: releaseMbid })));
  }

  return tracks;
}
