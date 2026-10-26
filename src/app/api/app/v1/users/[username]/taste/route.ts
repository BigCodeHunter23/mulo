import type { NextRequest } from "next/server";
import type { TastePage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { ENOUGH_TO_JUDGE, getRatingStyle } from "@/lib/rating-style";

/** How somebody rates against everyone else (`u/[username]/taste`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username } = await params;
    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    return appJson<TastePage>({
      profile,
      isSelf: caller.user?.id === profile.id,
      style: await getRatingStyle(profile.id),
      enough: ENOUGH_TO_JUDGE,
    });
  },
);
