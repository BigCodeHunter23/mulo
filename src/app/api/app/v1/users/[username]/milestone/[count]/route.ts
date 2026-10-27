import type { NextRequest } from "next/server";
import type { MilestonePage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getMilestoneCard } from "@/lib/milestone-card";

const NO_MILESTONE = "We couldn't find that milestone.";

/** A milestone's share card (`u/[username]/milestone/[count]`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string; count: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username, count } = await params;
    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    // Only a real milestone they've passed has a card, as on the page, and
    // only at one address: "100", not "1e2".
    const card = /^\d+$/.test(count)
      ? await getMilestoneCard(profile.username, Number(count))
      : null;
    if (!card) return appError(404, NO_MILESTONE);
    return appJson<MilestonePage>({ card, isSelf: caller.user?.id === profile.id });
  },
);
