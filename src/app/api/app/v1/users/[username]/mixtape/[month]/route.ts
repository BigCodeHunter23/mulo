import type { NextRequest } from "next/server";
import type { MixtapePage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { currentMonth, getMixtape, MONTH_PATTERN, shiftMonth } from "@/lib/mixtape";

const NO_MONTH = "We couldn't find that month.";

/** One month of somebody's Mixtape (`u/[username]/mixtape/[month]`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string; month: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username, month } = await params;
    const now = currentMonth();
    // Months are YYYY-MM, so they compare as strings. Nothing's rated in the
    // future, so unlike the page (an empty tape) a future month is a 404.
    if (!MONTH_PATTERN.test(month) || month > now) return appError(404, NO_MONTH);

    const profile = await visibleProfile(username);
    if (!profile) return appError(404, PERSON_NOT_FOUND);

    const next = shiftMonth(month, 1);
    return appJson<MixtapePage>({
      profile,
      isSelf: caller.user?.id === profile.id,
      mixtape: await getMixtape(profile.id, month),
      previous: shiftMonth(month, -1),
      next: next > now ? null : next,
    });
  },
);
