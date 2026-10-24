import type { NextRequest } from "next/server";
import type { PeoplePage } from "@/lib/app-api";
import { appJson, appRoute, signedInCaller } from "@/lib/app-route";
import { getFollowingIds, listProfiles } from "@/lib/social";
import { pageNumber } from "@/lib/validation";

/** The same page size as the website's People page. */
const PAGE_SIZE = 50;

/** Everyone on MULO, newest first, marking who you already follow. */
export const GET = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  const page = pageNumber(request.nextUrl.searchParams.get("page") ?? undefined);
  // One more than a page, to know whether there's another.
  const [found, following] = await Promise.all([
    listProfiles({ offset: (page - 1) * PAGE_SIZE, size: PAGE_SIZE + 1 }),
    getFollowingIds(user.id),
  ]);

  return appJson<PeoplePage>({
    people: found.slice(0, PAGE_SIZE),
    following,
    hasMore: found.length > PAGE_SIZE,
  });
});
