import type { NextRequest } from "next/server";
import type { FollowedArtistsPage } from "@/lib/app-api";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { listFollowedArtists } from "@/lib/artist-follows";
import { pageNumber } from "@/lib/validation";

/** The same page size as the website's Artists tab. */
const PAGE_SIZE = 50;

/**
 * The artists somebody follows, newest first, a page at a time. For people
 * with an account, as their followers are.
 */
export const GET = appRoute(
  async (request: NextRequest, { params }: Params<{ username: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    await limitReads(user);

    const profile = await visibleProfile((await params).username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const page = pageNumber(request.nextUrl.searchParams.get("page") ?? undefined);
    // One more than a page, to know whether there's another.
    const found = await listFollowedArtists(profile.id, {
      offset: (page - 1) * PAGE_SIZE,
      size: PAGE_SIZE + 1,
    });
    return appJson<FollowedArtistsPage>({
      artists: found.slice(0, PAGE_SIZE),
      hasMore: found.length > PAGE_SIZE,
    });
  },
);
