import type { NextRequest } from "next/server";
import type { AlbumPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, type Params } from "@/lib/app-route";
import { getCachedArtist, getCachedRelease } from "@/lib/catalog";
import { getOwnRating, getScores } from "@/lib/ratings";
import { getReactions } from "@/lib/reactions";
import { promptFor } from "@/lib/review-prompts";
import { getReviews } from "@/lib/reviews";
import { mbidSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find that album.";

/** Everything the album page shows above the tracklist, read the same way. */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, NOT_FOUND);
  const release = await getCachedRelease(mbid);
  if (!release) return appError(404, NOT_FOUND);

  const [artist, scores, own, reviews] = await Promise.all([
    release.artist_mbid ? getCachedArtist(release.artist_mbid) : null,
    getScores("album", mbid),
    getOwnRating("album", mbid),
    getReviews("album", mbid),
  ]);
  const reactions = await getReactions(
    "album",
    reviews.map((review) => review.id),
  );

  return appJson<AlbumPage>({
    release,
    artist,
    scores,
    own,
    reviews,
    reactions,
    prompt: promptFor("album", mbid),
  });
});
