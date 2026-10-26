import type { DropPage, ReactionSummary } from "@/lib/app-api";
import { appCaller, appJson, appRoute, limitReads } from "@/lib/app-route";
import { getCachedRelease } from "@/lib/catalog";
import { currentDrop, getDropResults } from "@/lib/drop";
import { getOwnRating } from "@/lib/ratings";
import { getReactions } from "@/lib/reactions";
import { getReviews } from "@/lib/reviews";

/** How many reviews the page shows under "The best takes". */
const BEST_TAKES = 6;

/**
 * The Drop (`drop/page.tsx`): this week's album, your score, and how it's
 * landing. The crowd's spread, average and best takes are left out until
 * you've given yours, so nobody's anchored by them. The tracklist comes from
 * `albums/[mbid]/tracks`, as the page streams it in on its own.
 */
export const GET = appRoute(async () => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  await limitReads(caller.user);

  const drop = currentDrop();
  const { mbid } = drop.album;
  const [release, results, own, reviews] = await Promise.all([
    getCachedRelease(mbid),
    getDropResults(drop),
    getOwnRating("album", mbid),
    getReviews("album", mbid),
  ]);
  const revealed = results.yours !== null;

  let best: typeof reviews = [];
  let reactions: Record<number, ReactionSummary> = {};
  if (revealed) {
    const all = await getReactions(
      "album",
      reviews.map((review) => review.id),
    );
    // The best takes first: the ones people loved most.
    best = [...reviews]
      .sort((a, b) => (all[b.id]?.love ?? 0) - (all[a.id]?.love ?? 0))
      .slice(0, BEST_TAKES);
    reactions = Object.fromEntries(
      best.flatMap((review) => (all[review.id] ? [[review.id, all[review.id]]] : [])),
    );
  }

  return appJson<DropPage>({
    drop,
    cover: release?.cover_art_url ?? null,
    year: release?.release_date?.slice(0, 4) ?? null,
    own,
    results: {
      count: results.count,
      thisWeek: results.thisWeek,
      yours: results.yours,
      average: revealed ? results.average : null,
      spread: revealed ? results.spread : null,
    },
    reviews: best,
    reactions,
  });
});
