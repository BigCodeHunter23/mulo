import type { NextRequest } from "next/server";
import type { ProfilePage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, type Params } from "@/lib/app-route";
import { isHidden } from "@/lib/blocks";
import { getUserFeed } from "@/lib/feed";
import { getHighestRatedAlbums } from "@/lib/ratings";
import { getFollowState, getProfileByUsername, getProfileStats } from "@/lib/social";
import { usernameSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find that person.";

/**
 * Somebody's profile: who they are, their numbers, whether you follow them,
 * their latest ratings and their top shelf. Badges, GOAT, taste and the rest
 * arrive with their own app stages.
 *
 * Their listening, item by item, is for people with an account, as on the
 * page: signed out, the ratings and the top shelf come back empty.
 */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;

    const { username } = await params;
    if (!usernameSchema.safeParse(username).success) return appError(404, NOT_FOUND);
    const profile = await getProfileByUsername(username);
    // Blocked, either way round: as far as each is concerned, the other is gone.
    if (!profile || (await isHidden(profile.id))) return appError(404, NOT_FOUND);

    const signedIn = Boolean(caller.user);
    const [stats, follow, recent, highest] = await Promise.all([
      getProfileStats(profile.id),
      getFollowState(profile.id),
      signedIn ? getUserFeed(profile.id) : [],
      signedIn ? getHighestRatedAlbums(profile.id, 12) : [],
    ]);
    return appJson<ProfilePage>({ profile, stats, follow, recent, highest });
  },
);
