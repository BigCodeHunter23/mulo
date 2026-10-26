import type { NextRequest } from "next/server";
import type { BadgesPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getBadgeBoard, getBadges } from "@/lib/badges";

/**
 * Somebody's badges: the row on their profile and the whole board
 * (`u/[username]/badges`). Apart from the profile, because working badges
 * out reads every rating they've made.
 */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username } = await params;
    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const [badges, board] = await Promise.all([getBadges(profile.id), getBadgeBoard(profile.id)]);
    return appJson<BadgesPage>({
      profile,
      isSelf: caller.user?.id === profile.id,
      badges,
      board,
    });
  },
);
