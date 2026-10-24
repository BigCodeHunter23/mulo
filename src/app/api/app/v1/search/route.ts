import type { NextRequest } from "next/server";
import type { SearchResponse } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute } from "@/lib/app-route";
import { allowAddress, TOO_MANY } from "@/lib/rate-limit";
import { friendsForResults, NO_FRIENDS } from "@/lib/ratings";
import { searchCatalog } from "@/lib/search";

/** MULO's own catalogue as you type, with what the people you follow gave each result. */
export const GET = appRoute(async (request: NextRequest) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  if (!(await allowAddress("search"))) return appError(429, TOO_MANY);

  const results = await searchCatalog(request.nextUrl.searchParams.get("q") ?? "", 8);
  const friends = caller.user ? await friendsForResults(results) : NO_FRIENDS;
  return appJson<SearchResponse>({ ...results, friends });
});
