import type { NextRequest } from "next/server";
import type { ArtistPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, type Params } from "@/lib/app-route";
import { getArtistFollowState } from "@/lib/artist-follows";
import { getCachedArtist, getCachedArtistAlbums, getCachedArtistEps } from "@/lib/catalog";
import { getSetProgress } from "@/lib/gauntlet";
import {
  getFriendRaters,
  getMyAlbumScores,
  getOwnRating,
  getScores,
  getScoresForReleases,
  getTopSongs,
} from "@/lib/ratings";
import { getReactions } from "@/lib/reactions";
import { getReviews } from "@/lib/reviews";
import { mbidSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find that artist.";

/** Everything the artist page shows, read the same way. */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, NOT_FOUND);
  const artist = await getCachedArtist(mbid);
  if (!artist) return appError(404, NOT_FOUND);

  const [albums, eps, scores, own, reviews, topSongs, follow] = await Promise.all([
    getCachedArtistAlbums(mbid),
    getCachedArtistEps(mbid),
    getScores("artist", mbid),
    getOwnRating("artist", mbid),
    getReviews("artist", mbid),
    getTopSongs(mbid),
    getArtistFollowState(mbid),
  ]);
  const albumMbids = albums.map((album) => album.mbid);
  const records = [...albumMbids, ...eps.map((ep) => ep.mbid)];
  const [albumScores, myAlbumScores, albumFriends, reactions, setProgress] = await Promise.all([
    getScoresForReleases(records),
    getMyAlbumScores(records),
    getFriendRaters("album", records),
    getReactions(
      "artist",
      reviews.map((review) => review.id),
    ),
    // How much of the discography (its albums) the signed-in person has rated.
    caller.user ? getSetProgress(caller.user.id, albumMbids) : null,
  ]);

  return appJson<ArtistPage>({
    artist,
    albums,
    eps,
    scores,
    own,
    reviews,
    reactions,
    topSongs,
    // Maps don't survive JSON.
    albumScores: Object.fromEntries(albumScores),
    myAlbumScores: Object.fromEntries(myAlbumScores),
    albumFriends,
    setProgress,
    following: follow.following,
    followers: follow.followers,
  });
});
