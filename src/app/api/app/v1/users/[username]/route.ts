import type { NextRequest } from "next/server";
import type { ProfilePage, Streak, TasteMatch } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getUserFeed } from "@/lib/feed";
import { getHighestRatedAlbums } from "@/lib/ratings";
import { getFollowState, getProfileStats } from "@/lib/social";
import { getStreak } from "@/lib/streak";
import { getTasteMatch } from "@/lib/taste";
import { getTopPicks } from "@/lib/top-picks";

/** What the flame shows when the streak couldn't be worked out: nothing. */
const NO_STREAK: Streak = { days: 0, today: false, best: 0 };

/**
 * Somebody's profile: who they are, their numbers, whether you follow them,
 * their latest ratings, their top shelf, their GOAT and how your taste
 * compares. Their badges come from their own endpoint, since working them out
 * is slow.
 *
 * Their listening, item by item, is for people with an account, as on the
 * page: signed out, the ratings and the top shelf come back empty.
 */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username } = await params;
    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const signedIn = Boolean(caller.user);
    const someoneElse = signedIn && caller.user?.id !== profile.id;
    const [stats, follow, recent, highest, streak, artists, albums, taste] = await Promise.all([
      getProfileStats(profile.id),
      getFollowState(profile.id),
      signedIn ? getUserFeed(profile.id) : [],
      signedIn ? getHighestRatedAlbums(profile.id, 12) : [],
      // Shown to anyone, as the flame on the page is. It's decoration, so a
      // failed read shows no flame rather than no profile.
      getStreak(profile.id).catch((error: unknown) => {
        console.error("[app-api] a streak failed:", error);
        return NO_STREAK;
      }),
      getTopPicks(profile.id, "artist"),
      getTopPicks(profile.id, "album"),
      // Decoration too: a failed match shows no card rather than no profile.
      someoneElse
        ? getTasteMatch(profile.id).catch((error: unknown) => {
            console.error("[app-api] a taste match failed:", error);
            return null;
          })
        : Promise.resolve<TasteMatch | null>(null),
    ]);
    return appJson<ProfilePage>({
      profile,
      stats,
      follow,
      recent,
      highest,
      streak,
      goat: { artists, albums },
      taste,
    });
  },
);
