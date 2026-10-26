import type { NextRequest } from "next/server";
import type { HeadToHeadPage } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getHeadToHead, MINIMUM } from "@/lib/head-to-head";

/** The signed-in person against somebody else (`u/[username]/vs`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    await limitReads(user);

    const { username } = await params;
    const profile = await visibleProfile(username);
    // There's no head to head with yourself; the page sends you to your profile.
    if (!profile || profile.id === user.id) return appError(404, PERSON_NOT_FOUND);

    return appJson<HeadToHeadPage>({
      profile,
      head: await getHeadToHead(profile.id),
      minimum: MINIMUM,
    });
  },
);
