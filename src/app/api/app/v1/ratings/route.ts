import type { NextRequest } from "next/server";
import { z } from "zod";
import { rate, removeRating } from "@/app/ratings/actions";
import type { RatingResult, RatingsPage } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  BAD_REQUEST,
  readBody,
  signedInCaller,
} from "@/lib/app-route";
import {
  getOwnAlbumRatings,
  getOwnArtistRatings,
  getOwnRatingCounts,
  getOwnSongRatings,
} from "@/lib/ratings";

const kindSchema = z.enum(["album", "artist", "song"]);

const listing = z.object({
  kind: kindSchema.default("album"),
  sort: z.enum(["recent", "highest", "lowest"]).default("recent"),
});

/** Everything you've rated, one kind at a time, as "My ratings" shows it. */
export const GET = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  const search = request.nextUrl.searchParams;
  const input = listing.safeParse({
    kind: search.get("kind") ?? undefined,
    sort: search.get("sort") ?? undefined,
  });
  if (!input.success) return appError(400, BAD_REQUEST);
  const { kind, sort } = input.data;

  const counts = await getOwnRatingCounts();
  if (kind === "artist") {
    return appJson<RatingsPage>({ counts, sort, kind, items: await getOwnArtistRatings(sort) });
  }
  if (kind === "song") {
    return appJson<RatingsPage>({ counts, sort, kind, items: await getOwnSongRatings(sort) });
  }
  return appJson<RatingsPage>({ counts, sort, kind, items: await getOwnAlbumRatings(sort) });
});

/** The shape only; `rate` checks the values, as it does for the website. */
const scoreBody = z.object({
  kind: kindSchema,
  mbid: z.string(),
  score: z.number(),
  releaseMbid: z.string().optional(),
});

/** Saves a score, exactly as tapping one on the website does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, scoreBody);
  if (body instanceof Response) return body;

  return appJson<RatingResult>(await rate(body.kind, body.mbid, body.score, body.releaseMbid));
});

const removal = z.object({
  kind: kindSchema,
  mbid: z.string(),
  releaseMbid: z.string().optional(),
});

/** Takes a score back. Its details ride in the address: some clients drop a DELETE's body. */
export const DELETE = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  const search = request.nextUrl.searchParams;
  const input = removal.safeParse({
    kind: search.get("kind") ?? undefined,
    mbid: search.get("mbid") ?? undefined,
    releaseMbid: search.get("releaseMbid") ?? undefined,
  });
  if (!input.success) return appError(400, BAD_REQUEST);

  const { kind, mbid, releaseMbid } = input.data;
  return appJson<RatingResult>(await removeRating(kind, mbid, releaseMbid));
});
