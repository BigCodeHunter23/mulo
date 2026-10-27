import type { NextRequest } from "next/server";
import type { AlbumLists } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { getListsWithAlbum, getMyListsFor } from "@/lib/lists";
import { mbidSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find that album.";

/**
 * An album's lists: the caller's own, ticked where it's already on them, for
 * Add to list, and the lists it's on, for "On these lists". Both are for
 * people with an account, as on the page.
 */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  await limitReads(caller.user);

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, NOT_FOUND);
  if (!caller.user) return appJson<AlbumLists>({ mine: [], featured: [] });

  const [mine, featured] = await Promise.all([
    getMyListsFor(caller.user.id, mbid),
    getListsWithAlbum(mbid),
  ]);
  return appJson<AlbumLists>({ mine, featured: featured.filter((list) => list.count > 0) });
});
