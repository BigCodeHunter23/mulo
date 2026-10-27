import type { NextRequest } from "next/server";
import type { FollowsPage } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getFollowingIds, listFollows } from "@/lib/social";
import { pageNumber } from "@/lib/validation";

/** The same page size as the website's followers page. */
const PAGE_SIZE = 50;

/**
 * Who somebody follows (`show=following`) or who follows them (anything
 * else), newest first, marking who the caller already follows. For people
 * with an account, as the page is.
 */
export const GET = appRoute(
  async (request: NextRequest, { params }: Params<{ username: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    await limitReads(user);

    const profile = await visibleProfile((await params).username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const query = request.nextUrl.searchParams;
    const direction = query.get("show") === "following" ? "following" : "followers";
    const page = pageNumber(query.get("page") ?? undefined);
    // One more than a page, to know whether there's another.
    const [found, following] = await Promise.all([
      listFollows(profile.id, direction, { offset: (page - 1) * PAGE_SIZE, size: PAGE_SIZE + 1 }),
      getFollowingIds(user.id),
    ]);

    return appJson<FollowsPage>({
      people: found.slice(0, PAGE_SIZE),
      following,
      hasMore: found.length > PAGE_SIZE,
    });
  },
);
