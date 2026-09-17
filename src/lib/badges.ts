import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  BADGE_COUNT,
  BADGE_GROUPS,
  GENRE_FAMILIES,
  SOLO_BADGES,
  familiesFor,
  tierFor,
  type Badge,
} from "@/lib/badge-catalog";

export type { Badge };

type AlbumRating = {
  id: number;
  score: number;
  review: string | null;
  created_at: string;
  release_mbid: string;
  releases: {
    artist_mbid: string | null;
    release_date: string | null;
    genres: string[];
  } | null;
};
type ArtistRating = {
  id: number;
  artist_mbid: string;
  score: number;
  review: string | null;
};
type SongRating = {
  song_mbid: string;
  release_mbid: string;
  score: number;
  created_at: string;
};

// Long lists of ids make long URLs, so the catalogue lookups are capped. At
// soft-launch scale nobody comes close; past that these belong in a view.
const ID_LIMIT = 200;

/** Albums of one artist that have to be rated before it counts as a set. */
const DISCOGRAPHY = 4;
const BOX_SET = 5;

/** Songs an album needs before rating them all means anything. */
const FULL_ALBUM = 5;
const NO_SKIPS = 6;

const GENRES_FOR_OMNIVORE = 6;

type Collected = {
  earned: Set<string>;
  /** Albums rated in each genre family, by family id. */
  genres: Map<string, number>;
};

/** The hour in Sydney a rating was left, 0 to 23. */
const sydneyHour = (iso: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Sydney",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );

/** The month a rating landed in, as 2026-09, in Sydney time. */
const sydneyMonth = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));

/**
 * Badges are worked out from what somebody has rated rather than stored, so
 * they can never drift from the truth and there is nothing to maintain. The
 * ones worth having reward range and depth, not volume alone: rating without
 * listening should not pay.
 *
 * Cached for the request, because a profile shows a handful and the badge
 * board shows all of them, and neither should pay for the other.
 */
const collect = cache(async function collect(userId: string): Promise<Collected> {
  const supabase = await createClient();
  const earned = new Set<string>();

  const [albums, artists, songs, following, profile, topAlbums, topArtists, votes, takes] =
    await Promise.all([
      supabase
        .from("ratings")
        .select(
          "id, score, review, created_at, release_mbid, releases!inner ( artist_mbid, release_date, genres )",
        )
        .eq("user_id", userId)
        .limit(2000),
      supabase
        .from("artist_ratings")
        .select("id, artist_mbid, score, review")
        .eq("user_id", userId)
        .limit(2000),
      supabase
        .from("song_ratings")
        .select("song_mbid, release_mbid, score, created_at")
        .eq("user_id", userId)
        .limit(5000),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId),
      supabase
        .from("profiles")
        .select("created_at, raised_on_mbid")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("top_albums")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("top_artists")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("versus_votes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      // Takes arrived in a later migration; before it runs this just misses.
      supabase
        .from("versus_takes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

  const albumRatings = (albums.data ?? []) as unknown as AlbumRating[];
  const artistRatings = (artists.data ?? []) as ArtistRating[];
  const songRatings = (songs.data ?? []) as SongRating[];
  const all = [...albumRatings, ...artistRatings, ...songRatings];

  // Starting out.
  if (all.length > 0) earned.add("first-spin");
  if (profile.data?.raised_on_mbid) earned.add("raised-on");
  if ((following.count ?? 0) >= 10) earned.add("the-crew");

  const reviews =
    albumRatings.filter((r) => r.review?.trim()).length +
    artistRatings.filter((r) => r.review?.trim()).length;
  if (reviews >= 1) earned.add("on-the-record");
  if (reviews >= 10) earned.add("liner-notes");

  // Your calls.
  if (all.filter((r) => r.score === 10).length >= 10) earned.add("certified");
  if (all.some((r) => r.score === 1)) earned.add("tough-crowd");
  if ((topAlbums.count ?? 0) >= 3 || (topArtists.count ?? 0) >= 3) {
    earned.add("goat-status");
  }

  const albumMonths = new Set(albumRatings.map((r) => sydneyMonth(r.created_at)));
  if (songRatings.some((r) => albumMonths.has(sydneyMonth(r.created_at)))) {
    earned.add("mixtape");
  }

  const stamps = [
    ...albumRatings.map((r) => r.created_at),
    ...songRatings.map((r) => r.created_at),
  ];
  if (stamps.some((at) => sydneyHour(at) >= 1 && sydneyHour(at) < 5)) {
    earned.add("the-whole-night");
  }

  // The crowd.
  if ((votes.count ?? 0) >= 10) earned.add("ringside");
  if ((takes.count ?? 0) >= 1) earned.add("hot-take");

  if (profile.data?.created_at) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .lt("created_at", profile.data.created_at);
    if ((count ?? 0) < 100) earned.add("day-ones");
  }

  // Loves on their own ratings: other people agreeing out loud.
  const albumIds = albumRatings.map((r) => r.id).slice(0, ID_LIMIT);
  const artistIds = artistRatings.map((r) => r.id).slice(0, ID_LIMIT);
  const [albumLoves, artistLoves] = await Promise.all([
    albumIds.length > 0
      ? supabase
          .from("reactions")
          .select("*", { count: "exact", head: true })
          .eq("value", 1)
          .in("rating_id", albumIds)
      : { count: 0 },
    artistIds.length > 0
      ? supabase
          .from("reactions")
          .select("*", { count: "exact", head: true })
          .eq("value", 1)
          .in("artist_rating_id", artistIds)
      : { count: 0 },
  ]);
  if ((albumLoves.count ?? 0) + (artistLoves.count ?? 0) >= 10) earned.add("co-sign");

  // Depth and range.
  if (albumRatings.length >= 100) earned.add("century");
  if (songRatings.length >= 100) earned.add("crate-digger");
  if (artistRatings.length >= 25) earned.add("a-and-r");

  const decades = new Set(
    albumRatings.flatMap((r) =>
      r.releases?.release_date ? [r.releases.release_date.slice(0, 3)] : [],
    ),
  );
  if (decades.size >= 5) earned.add("time-traveller");

  // Genre ladders, counted in albums. A record in two families counts for both.
  const genres = new Map<string, number>();
  for (const rating of albumRatings) {
    for (const family of familiesFor(rating.releases?.genres ?? [])) {
      genres.set(family, (genres.get(family) ?? 0) + 1);
    }
  }
  for (const family of GENRE_FAMILIES) {
    const tier = tierFor(family, genres.get(family.id) ?? 0);
    if (!tier) continue;
    for (const step of family.tiers) {
      if (step.need <= tier.need) earned.add(step.slug);
    }
  }
  if (genres.size >= GENRES_FOR_OMNIVORE) earned.add("omnivore");

  const ratedAlbums = new Set(albumRatings.map((r) => r.release_mbid));
  const ratedArtists = new Set(artistRatings.map((r) => r.artist_mbid));
  const songScores = new Map(songRatings.map((r) => [r.song_mbid, r.score]));
  const albumsWithSongRatings = new Set(songRatings.map((r) => r.release_mbid));

  // Only artists with enough rated albums could have a full set, so only those
  // are worth asking the catalogue about.
  const ratedPerArtist = new Map<string, number>();
  for (const rating of albumRatings) {
    const artist = rating.releases?.artist_mbid;
    if (artist) ratedPerArtist.set(artist, (ratedPerArtist.get(artist) ?? 0) + 1);
  }
  const candidates = [...ratedPerArtist]
    .filter(([, count]) => count >= DISCOGRAPHY)
    .map(([mbid]) => mbid)
    .slice(0, 20);

  const { data: catalogueRows } =
    candidates.length > 0
      ? await supabase
          .from("releases")
          .select("mbid, artist_mbid")
          .in("artist_mbid", candidates)
      : { data: [] };

  const albumsByArtist = new Map<string, string[]>();
  for (const row of (catalogueRows ?? []) as { mbid: string; artist_mbid: string }[]) {
    albumsByArtist.set(row.artist_mbid, [
      ...(albumsByArtist.get(row.artist_mbid) ?? []),
      row.mbid,
    ]);
  }

  const trackAlbums = [
    ...new Set([...[...albumsByArtist.values()].flat(), ...albumsWithSongRatings]),
  ].slice(0, ID_LIMIT);

  const { data: trackRows } =
    trackAlbums.length > 0
      ? await supabase
          .from("tracks")
          .select("release_mbid, song_mbid")
          .in("release_mbid", trackAlbums)
      : { data: [] };

  const songsByAlbum = new Map<string, string[]>();
  for (const row of (trackRows ?? []) as {
    release_mbid: string;
    song_mbid: string | null;
  }[]) {
    if (!row.song_mbid) continue;
    songsByAlbum.set(row.release_mbid, [
      ...(songsByAlbum.get(row.release_mbid) ?? []),
      row.song_mbid,
    ]);
  }

  for (const [artist, catalogue] of albumsByArtist) {
    if (catalogue.length < DISCOGRAPHY) continue;
    if (!catalogue.every((mbid) => ratedAlbums.has(mbid))) continue;

    earned.add("discography");

    // Box Set is the whole thing: the artist, every album, every song on them.
    if (catalogue.length < BOX_SET || !ratedArtists.has(artist)) continue;
    const songIds = catalogue.flatMap((mbid) => songsByAlbum.get(mbid) ?? []);
    if (songIds.length < BOX_SET) continue;
    if (songIds.every((mbid) => songScores.has(mbid))) earned.add("box-set");
  }

  for (const [albumMbid, songIds] of songsByAlbum) {
    if (!albumsWithSongRatings.has(albumMbid)) continue;
    if (songIds.length >= FULL_ALBUM && songIds.every((mbid) => songScores.has(mbid))) {
      earned.add("track-by-track");
    }
    if (
      songIds.length >= NO_SKIPS &&
      songIds.every((mbid) => (songScores.get(mbid) ?? 0) >= 8)
    ) {
      earned.add("no-skips");
    }
  }

  return { earned, genres };
});

/** Badges somebody has, for the row on their profile. */
export async function getBadges(userId: string): Promise<Badge[]> {
  const { earned, genres } = await collect(userId);

  // One chip per genre, showing the highest rung reached.
  const ladders = GENRE_FAMILIES.flatMap((family) => {
    const tier = tierFor(family, genres.get(family.id) ?? 0);
    return tier
      ? [
          {
            slug: tier.slug,
            name: tier.name,
            description: `Rated ${tier.need} ${family.name.toLowerCase()} albums`,
          },
        ]
      : [];
  });

  return [...ladders, ...SOLO_BADGES.filter((badge) => earned.has(badge.slug))];
}

export type BoardBadge = {
  slug: string;
  name: string;
  earned: boolean;
  /** Only filled in once earned. Locked ones keep their secret. */
  description: string | null;
};

export type BoardGroup = { id: string; title: string; badges: BoardBadge[] };

export type BoardLadder = {
  id: string;
  name: string;
  /** Albums rated in this genre so far. */
  rated: number;
  tiers: { slug: string; name: string; earned: boolean }[];
};

export type BadgeBoard = {
  earned: number;
  total: number;
  groups: BoardGroup[];
  ladders: BoardLadder[];
};

/** Everything there is to collect, and which of it somebody has. */
export async function getBadgeBoard(userId: string): Promise<BadgeBoard> {
  const { earned, genres } = await collect(userId);

  const groups = BADGE_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    badges: group.badges.map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      earned: earned.has(badge.slug),
      description: earned.has(badge.slug) ? badge.description : null,
    })),
  }));

  const ladders = GENRE_FAMILIES.map((family) => ({
    id: family.id,
    name: family.name,
    rated: genres.get(family.id) ?? 0,
    tiers: family.tiers.map((tier) => ({
      slug: tier.slug,
      name: tier.name,
      earned: earned.has(tier.slug),
    })),
  }));

  return { earned: earned.size, total: BADGE_COUNT, groups, ladders };
}
