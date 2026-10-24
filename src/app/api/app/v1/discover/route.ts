import type { DiscoverPage } from "@/lib/app-api";
import { appCaller, appJson, appRoute } from "@/lib/app-route";
import {
  artistsToExplore,
  mostPlayedAlbums,
  newReleases,
  SHELVES,
  topRatedOnMulo,
} from "@/lib/discover";
import { getGlobalFeed } from "@/lib/feed";
import { getMyAlbumScores } from "@/lib/ratings";
import { getHeavyRotation } from "@/lib/trending";

/**
 * A shelf's worth, or nothing: below its minimum the Discover page leaves a
 * shelf out, and so does the app. A shelf whose read fails is left out the
 * same way, as the page's sections each stream on their own.
 */
function shelf<T>(read: PromiseSettledResult<T[]>, minimum: number): T[] {
  if (read.status !== "fulfilled") {
    console.error("[app-api] a Discover shelf failed:", read.reason);
    return [];
  }
  return read.value.length >= minimum ? read.value : [];
}

/** The Discover page's shelves (`DiscoverSections`), in one answer. */
export const GET = appRoute(async () => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  const [rotation, fresh, best, played, artists, recent] = await Promise.allSettled([
    getHeavyRotation(SHELVES.rotation.limit),
    newReleases(SHELVES.newReleases.limit),
    topRatedOnMulo(SHELVES.topRated.limit),
    mostPlayedAlbums(SHELVES.mostPlayed.limit),
    artistsToExplore(SHELVES.artistsToExplore.limit),
    getGlobalFeed(SHELVES.justRated.limit),
  ]);

  const page: Omit<DiscoverPage, "mine"> = {
    rotation: rotation.status === "fulfilled" ? rotation.value : null,
    newReleases: shelf(fresh, SHELVES.newReleases.minimum),
    topRated: shelf(best, SHELVES.topRated.minimum),
    mostPlayed: shelf(played, SHELVES.mostPlayed.minimum),
    artistsToExplore: shelf(artists, SHELVES.artistsToExplore.minimum),
    justRated: shelf(recent, SHELVES.justRated.minimum),
  };

  // Your own score stamped on every album shown, as the page's cards have it.
  const albums = [
    ...(page.rotation?.albums ?? []),
    ...page.newReleases,
    ...page.topRated,
    ...page.mostPlayed,
  ].map((album) => album.mbid);
  const mine = caller.user ? await getMyAlbumScores([...new Set(albums)]) : new Map();

  return appJson<DiscoverPage>({ ...page, mine: Object.fromEntries(mine) });
});
