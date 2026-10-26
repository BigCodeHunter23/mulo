import type { NextRequest } from "next/server";
import type { MilestonePage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getMilestoneCard } from "@/lib/milestone-card";

/** A milestone's share card (`u/[username]/milestone/[count]`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string; count: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username, count } = await params;
    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    // Only a real milestone they've passed has a card, as on the page.
    const card = await getMilestoneCard(profile.username, Number(count));
    if (!card) return appError(404, "We couldn't find that milestone.");
    return appJson<MilestonePage>({ card, isSelf: caller.user?.id === profile.id });
  },
);
