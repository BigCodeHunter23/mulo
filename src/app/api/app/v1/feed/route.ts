import type { NextRequest } from "next/server";
import { z } from "zod";
import type { FeedResponse } from "@/lib/app-api";
import { appError, appJson, appRoute, BAD_REQUEST, signedInCaller } from "@/lib/app-route";
import { getFollowingFeed, getGlobalFeed } from "@/lib/feed";

const scopeSchema = z.enum(["following", "everyone"]).default("following");

/**
 * The home feed: the people you follow, or everyone on MULO, which the home
 * page shows below your own feed ("Around MULO").
 */
export const GET = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  const scope = scopeSchema.safeParse(request.nextUrl.searchParams.get("scope") ?? undefined);
  if (!scope.success) return appError(400, BAD_REQUEST);

  const items =
    scope.data === "everyone" ? await getGlobalFeed(24) : await getFollowingFeed(user.id);
  return appJson<FeedResponse>({ items });
});
