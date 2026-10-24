import type { NextRequest } from "next/server";
import { z } from "zod";
import type { RatingsPage } from "@/lib/app-api";
import { appError, appJson, appRoute, BAD_REQUEST, signedInCaller } from "@/lib/app-route";
import {
  getOwnAlbumRatings,
  getOwnArtistRatings,
  getOwnRatingCounts,
  getOwnSongRatings,
} from "@/lib/ratings";

const listing = z.object({
  kind: z.enum(["album", "artist", "song"]).default("album"),
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
