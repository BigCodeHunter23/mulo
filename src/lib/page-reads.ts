import "server-only";
import {
  getCachedArtist,
  getCachedArtistAlbums,
  getCachedArtistEps,
  getCachedRelease,
  getCachedTracks,
  readFinishedArtist,
  readFinishedRecords,
  readFinishedRelease,
  readFinishedTracks,
} from "@/lib/catalog";
import { CATALOG_CACHE_SECONDS, SIGNED_OUT_CACHE_SECONDS } from "@/lib/cache-times";
import { getArtistFollowState } from "@/lib/artist-follows";
import { getScores, getScoresForReleases, getSongScores, getTopSongs } from "@/lib/ratings";
import { getReactions } from "@/lib/reactions";
import { getReviews } from "@/lib/reviews";
import { keptRead, sharedWhenSignedOut } from "@/lib/shared-reads";
import { createPublicClient } from "@/lib/supabase/public";
import { mbidSchema } from "@/lib/validation";

/**
 * What the album and artist pages read, kept where it can be, because an open
 * page costs about fifteen database requests and a crawler opens thousands.
 *
 * The catalogue is the same for everybody and rarely changes once it's complete.
 * An answer of null means it isn't complete yet, and the page then goes the long
 * way round through `getCachedRelease` and friends, which fetch it from
 * MusicBrainz under that visitor's own limit.
 *
 * Scores and reviews differ for somebody signed in (their own score, who they
 * follow, who they've blocked), so only signed-out visitors share those. Something
 * deleted, a review taken down say, can show to them until the hour's up.
 */

const finishedRelease = keptRead("finished-release", CATALOG_CACHE_SECONDS, readFinishedRelease);
const finishedArtist = keptRead("finished-artist", CATALOG_CACHE_SECONDS, readFinishedArtist);
const finishedTracks = keptRead("finished-tracks", CATALOG_CACHE_SECONDS, readFinishedTracks);
const finishedRecords = keptRead("finished-records", SIGNED_OUT_CACHE_SECONDS, readFinishedRecords);

export async function releaseFor(mbid: string) {
  return (await finishedRelease(mbid)) ?? getCachedRelease(mbid);
}

export async function artistFor(mbid: string) {
  return (await finishedArtist(mbid)) ?? getCachedArtist(mbid);
}

export async function tracksFor(releaseMbid: string) {
  return (await finishedTracks(releaseMbid)) ?? getCachedTracks(releaseMbid);
}

/** Read live when signed in: a new album should reach its followers' artist pages at once. */
export async function recordsFor(signedIn: boolean, artistMbid: string) {
  const finished = signedIn ? null : await finishedRecords(artistMbid);
  if (finished) return finished;
  const [albums, eps] = await Promise.all([
    getCachedArtistAlbums(artistMbid),
    getCachedArtistEps(artistMbid),
  ]);
  return { albums, eps };
}

async function readAlbumHeadline(mbid: string) {
  const { data } = await createPublicClient()
    .from("releases")
    .select("title, release_date, artists ( name )")
    .eq("mbid", mbid)
    .maybeSingle();
  return data;
}

/** Kept once it can say whose album it is: the artist may arrive with this very visit. */
const finishedAlbumHeadline = keptRead(
  "album-headline",
  CATALOG_CACHE_SECONDS,
  async (mbid: string) => {
    const headline = await readAlbumHeadline(mbid);
    return headline?.artists ? headline : null;
  },
);

/** The title and description of an album's page. */
export async function albumHeadline(mbid: string) {
  if (!mbidSchema.safeParse(mbid).success) return null;
  return (await finishedAlbumHeadline(mbid)) ?? readAlbumHeadline(mbid);
}

/**
 * The title and description of an artist's page. Read live until the artist is
 * finished: a first visit fetches their bio, and search engines and link
 * previews shouldn't be shown its absence for a day.
 */
export async function artistHeadline(mbid: string) {
  if (!mbidSchema.safeParse(mbid).success) return null;
  const finished = await finishedArtist(mbid);
  if (finished) return finished;
  const { data } = await createPublicClient()
    .from("artists")
    .select("name, bio")
    .eq("mbid", mbid)
    .maybeSingle();
  return data;
}

/** An album's scores and reviews, with the loves and nahs on them. */
export const albumVoices = sharedWhenSignedOut(
  "album-voices",
  SIGNED_OUT_CACHE_SECONDS,
  async (mbid: string) => {
    const [scores, reviews] = await Promise.all([
      getScores("album", mbid),
      getReviews("album", mbid),
    ]);
    const reactions = await getReactions(
      "album",
      reviews.map((review) => review.id),
    );
    return { scores, reviews, reactions };
  },
);

/** An artist's scores, reviews, top songs and followers. */
export const artistVoices = sharedWhenSignedOut(
  "artist-voices",
  SIGNED_OUT_CACHE_SECONDS,
  async (mbid: string) => {
    const [scores, reviews, topSongs, follow] = await Promise.all([
      getScores("artist", mbid),
      getReviews("artist", mbid),
      getTopSongs(mbid),
      getArtistFollowState(mbid),
    ]);
    const reactions = await getReactions(
      "artist",
      reviews.map((review) => review.id),
    );
    return { scores, reviews, topSongs, follow, reactions };
  },
);

export const songScores = sharedWhenSignedOut(
  "song-scores",
  SIGNED_OUT_CACHE_SECONDS,
  getSongScores,
);

/** As pairs: what's kept has to survive being written out as JSON, and a Map doesn't. */
export const recordScores = sharedWhenSignedOut(
  "record-scores",
  SIGNED_OUT_CACHE_SECONDS,
  async (mbids: string[]) => [...(await getScoresForReleases(mbids))],
);
