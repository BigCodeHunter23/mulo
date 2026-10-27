import type { NextRequest } from "next/server";
import type { ListSummary } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getUserLists } from "@/lib/lists";

/**
 * Somebody's lists with albums on them, most recently changed first. For
 * people with an account, as the page is.
 */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    await limitReads(user);

    const profile = await visibleProfile((await params).username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const lists = await getUserLists(profile.id);
    return appJson<ListSummary[]>(lists.filter((list) => list.count > 0));
  },
);
