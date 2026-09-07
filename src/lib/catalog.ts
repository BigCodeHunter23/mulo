import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  coverArtUrl,
  getArtist,
  getArtistReleaseGroups,
  getReleaseGroup,
  getTracklist,
  wikidataQid,
  MbNotFoundError,
} from "@/lib/musicbrainz";
import { getArtistExtras } from "@/lib/wikidata";

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
    .maybeSingle();

  // image_url null means we have never looked for a photo; an empty string
  // means we looked and there wasn't one, so we don't ask again every visit.
  if (cached && cached.image_url !== null) return cached;

  let mb;
  try {
    mb = await getArtist(mbid);
  } catch (error) {
    if (error instanceof MbNotFoundError) return null;
    // Already cached and MusicBrainz is unhappy: show what we have.
    if (cached) return cached;
    throw error;
  }

  const qid = wikidataQid(mb);
  const extras = qid
    ? await getArtistExtras(qid)
    : { imageUrl: null, bio: null };

  const artist: Artist = {
    mbid: mb.id,
    name: mb.name,
    image_url: extras.imageUrl ?? "",
    bio: extras.bio || mb.disambiguation || null,
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
    // nullsFirst: false keeps undated entries (usually unofficial odds and
    // ends) at the bottom rather than above the real discography.
    .order("release_date", { ascending: false, nullsFirst: false });

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

  // Newest first, with undated entries last.
  return releases.sort((a, b) => {
    if (!a.release_date && !b.release_date) return 0;
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return b.release_date.localeCompare(a.release_date);
  });
}

export async function getCachedRelease(mbid: string): Promise<Release | null> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("releases")
    .select("mbid, title, artist_mbid, release_date, cover_art_url, genres")
    .eq("mbid", mbid)
    .single();

  if (cached && cached.genres.length > 0) return cached;

  let mb;
  try {
    mb = await getReleaseGroup(mbid);
  } catch (error) {
    if (error instanceof MbNotFoundError) return null;
    throw error;
  }

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
