import type { NextRequest } from "next/server";
import type {
  DiaryEntry,
  ListSummary,
  ProfilePage,
  RaisedOn,
  Streak,
  TasteMatch,
} from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { recentListening } from "@/lib/diary/read";
import { getUserFeed } from "@/lib/feed";
import { getUserLists } from "@/lib/lists";
import { getRaisedOn } from "@/lib/raised-on";
import { getHighestRatedAlbums } from "@/lib/ratings";
import { getFollowState, getProfileStats } from "@/lib/social";
import { getStreak } from "@/lib/streak";
import { getTasteMatch } from "@/lib/taste";
import { getTopPicks } from "@/lib/top-picks";

/** What the flame shows when the streak couldn't be worked out: nothing. */
const NO_STREAK: Streak = { days: 0, today: false, best: 0 };

/** How many lists the profile shows before "All". */
const LISTS_SHOWN = 3;

/** Decoration on a profile: a failed read shows nothing rather than no profile. */
function quietly<T>(what: string, read: Promise<T>, fallback: T): Promise<T> {
  return read.catch((error: unknown) => {
    console.error(`[app-api] ${what} failed:`, error);
    return fallback;
  });
}

/**
 * Somebody's profile: who they are, their numbers, whether you follow them,
 * their latest ratings, their top shelf, their GOAT, their lists, the record
 * they were raised on, their latest listening and how your taste compares. Their badges come from their own endpoint, since working them out
 * is slow.
 *
 * Their listening, item by item, is for people with an account, as on the
 * page: signed out, the ratings and the top shelf come back empty. Their
 * diary decides for itself: a public one shows to anyone, as on the page.
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
    const [stats, follow, recent, highest, streak, artists, albums, taste, lists, raisedOn, diary] =
      await Promise.all([
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
        // Lists are for people with an account, as the page's section is.
        signedIn
          ? quietly("lists", getUserLists(profile.id), [])
          : Promise.resolve<ListSummary[]>([]),
        quietly<RaisedOn | null>("raised on", getRaisedOn(profile.id), null),
        // Row-level security reads the diary as the viewer may see it.
        quietly<DiaryEntry[]>("listening", recentListening(profile.id), []),
      ]);
    const shown = lists.filter((list) => list.count > 0);
    return appJson<ProfilePage>({
      profile,
      stats,
      follow,
      recent,
      highest,
      streak,
      goat: { artists, albums },
      taste,
      lists: { top: shown.slice(0, LISTS_SHOWN), count: shown.length },
      raisedOn,
      diary,
    });
  },
);
