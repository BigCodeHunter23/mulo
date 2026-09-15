import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { copyCoverToStorage } from "@/lib/cover-storage";
import {
  coverArtUrl,
  creditText,
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
  /** The song, for rating. Null on a tracklist saved before songs existed. */
  song_mbid: string | null;
};

const RELEASE_COLUMNS =
  "mbid, title, artist_mbid, release_date, cover_art_url, genres";

/** Newest first, with undated entries last. */
function byNewest(a: Release, b: Release) {
  if (!a.release_date && !b.release_date) return 0;
  if (!a.release_date) return 1;
  if (!b.release_date) return -1;
  return b.release_date.localeCompare(a.release_date);
}

/** A cover still served by the archive gets copied to our storage, later. */
function copyCoverLater(release: Pick<Release, "mbid" | "cover_art_url">) {
  if (release.cover_art_url?.includes("coverartarchive.org")) {
    after(() => copyCoverToStorage(release.mbid));
  }
}

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

  // Aliases too, so "Kanye West" still finds the artist now called Ye.
  const searchNames = [
    ...new Set([mb.name, ...(mb.aliases ?? []).map((a) => a.name)].filter(Boolean)),
  ].join(" | ");

  await createAdminClient()
    .from("artists")
    .upsert({ ...artist, search_names: searchNames });

  return artist;
}

export async function getCachedArtistAlbums(
  artistMbid: string,
): Promise<Release[]> {
  const supabase = await createClient();

  const [{ data: artist }, { data: cached }] = await Promise.all([
    supabase
      .from("artists")
      .select("albums_cached_at")
      .eq("mbid", artistMbid)
      .maybeSingle(),
    supabase
      .from("releases")
      .select(RELEASE_COLUMNS)
      .eq("artist_mbid", artistMbid)
      .order("release_date", { ascending: false, nullsFirst: false }),
  ]);

  // Albums get cached one at a time as people open them, so having some is
  // not the same as having all of them. Only trust the list once the whole
  // discography has been fetched.
  if (artist?.albums_cached_at) return cached ?? [];

  let groups;
  try {
    groups = await getArtistReleaseGroups(artistMbid);
  } catch (error) {
    if (cached && cached.length > 0) return cached;
    throw error;
  }

  const presentIds = new Set((cached ?? []).map((r) => r.mbid));
  const fresh = groups
    .filter((g) => !presentIds.has(g.id))
    .map((g) => ({
      mbid: g.id,
      title: g.title,
      artist_mbid: artistMbid,
      release_date: g["first-release-date"] || null,
      cover_art_url: coverArtUrl(g.id),
      artist_credit: creditText(g["artist-credit"]),
    }));

  const admin = createAdminClient();
  if (fresh.length > 0) {
    await admin
      .from("releases")
      .upsert(fresh, { onConflict: "mbid", ignoreDuplicates: true });
  }
  await admin
    .from("artists")
    .update({ albums_cached_at: new Date().toISOString() })
    .eq("mbid", artistMbid);

  const releases: Release[] = [
    ...(cached ?? []),
    ...fresh.map((r) => ({
      mbid: r.mbid,
      title: r.title,
      artist_mbid: r.artist_mbid,
      release_date: r.release_date,
      cover_art_url: r.cover_art_url,
      genres: [],
    })),
  ];

  return releases.sort(byNewest);
}

export async function getCachedRelease(mbid: string): Promise<Release | null> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("releases")
    .select(`${RELEASE_COLUMNS}, details_cached_at`)
    .eq("mbid", mbid)
    .maybeSingle();

  // A release listed on an artist's page has a title and date but no genres
  // yet; only one whose details were fetched is complete.
  if (cached?.details_cached_at) {
    copyCoverLater(cached);
    return cached;
  }

  let mb;
  try {
    mb = await getReleaseGroup(mbid);
  } catch (error) {
    if (error instanceof MbNotFoundError) return null;
    if (cached) return cached;
    throw error;
  }

  const credit = mb["artist-credit"] ?? [];
  const primary = credit[0]?.artist;
  const admin = createAdminClient();

  if (primary) {
    await admin
      .from("artists")
      .upsert(
        { mbid: primary.id, name: primary.name },
        { onConflict: "mbid", ignoreDuplicates: true },
      );
  }

  const details = {
    title: mb.title,
    artist_mbid: primary?.id ?? null,
    release_date: mb["first-release-date"] || null,
    genres: (mb.genres ?? []).map((g) => g.name),
    artist_credit: creditText(credit),
    details_cached_at: new Date().toISOString(),
  };

  // An existing row keeps its cover, which may already be in our storage.
  const cover: string | null = cached ? cached.cover_art_url : coverArtUrl(mb.id);

  if (cached) {
    await admin.from("releases").update(details).eq("mbid", mb.id);
  } else {
    await admin
      .from("releases")
      .upsert({ mbid: mb.id, cover_art_url: cover, ...details }, { onConflict: "mbid" });
  }

  const release: Release = {
    mbid: mb.id,
    title: details.title,
    artist_mbid: details.artist_mbid,
    release_date: details.release_date,
    cover_art_url: cover,
    genres: details.genres,
  };

  copyCoverLater(release);
  return release;
}

export async function getCachedTracks(releaseMbid: string): Promise<Track[]> {
  const supabase = await createClient();

  const [{ data: release }, { data: cached }] = await Promise.all([
    supabase
      .from("releases")
      .select("tracks_cached_at")
      .eq("mbid", releaseMbid)
      .maybeSingle(),
    supabase
      .from("tracks")
      .select("position, title, duration_ms, song_mbid")
      .eq("release_mbid", releaseMbid)
      .order("position"),
  ]);

  // Only a tracklist taken from the standard edition, with its songs, is
  // final. One saved before that gets replaced.
  if (release?.tracks_cached_at) return cached ?? [];

  let mbTracks;
  try {
    mbTracks = await getTracklist(releaseMbid);
  } catch {
    // The old tracklist, or none, beats a broken page. Retried next visit.
    return cached ?? [];
  }
  if (mbTracks.length === 0) return cached ?? [];

  // Numbered straight through, so a double album doesn't repeat 1, 2, 3.
  const tracks: Track[] = mbTracks.map((t, i) => ({
    position: i + 1,
    title: t.title,
    duration_ms: t.length ?? null,
    song_mbid: t.recording?.id ?? null,
  }));

  // A song can appear twice on one album; save it once.
  const songs = new Map<string, { mbid: string; title: string; duration_ms: number | null }>();
  for (const t of mbTracks) {
    if (t.recording) {
      songs.set(t.recording.id, {
        mbid: t.recording.id,
        title: t.recording.title,
        duration_ms: t.recording.length ?? null,
      });
    }
  }

  const admin = createAdminClient();
  if (songs.size > 0) {
    const { error } = await admin
      .from("songs")
      .upsert([...songs.values()], { onConflict: "mbid" });
    if (error) return cached ?? [];
  }

  // Ratings belong to songs, not to these rows, so replacing them is safe.
  await admin.from("tracks").delete().eq("release_mbid", releaseMbid);
  const { error } = await admin
    .from("tracks")
    .insert(tracks.map((t) => ({ ...t, release_mbid: releaseMbid })));

  // An error here usually means someone else saved it a moment ago; theirs
  // stands and marks it done.
  if (!error) {
    await admin
      .from("releases")
      .update({ tracks_cached_at: new Date().toISOString() })
      .eq("mbid", releaseMbid);
  }

  return tracks;
}
