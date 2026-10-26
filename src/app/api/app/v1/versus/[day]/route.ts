import type { NextRequest } from "next/server";
import type { VersusDayPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { visibleTakes } from "@/lib/app-versus";
import {
  DAY_PATTERN,
  getMatchupForDay,
  getTodaysMatchup,
  getVersusView,
  sydneyDay,
} from "@/lib/versus";

const NOT_FOUND = "There's no Versus on that day.";

/** Today's matchup, or a past one; there's nothing to see ahead of time. */
async function matchupFor(day: string) {
  if (!DAY_PATTERN.test(day)) return null;

  const today = sydneyDay();
  if (day > today) return null;
  return day === today ? getTodaysMatchup() : getMatchupForDay(day);
}

/** One day's matchup (`versus/[day]/page.tsx`), with its takes as the caller may see them. */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ day: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  await limitReads(caller.user);

  const matchup = await matchupFor((await params).day);
  if (!matchup) return appError(404, NOT_FOUND);

  const view = await getVersusView(matchup);
  return appJson<VersusDayPage>({ view, takes: await visibleTakes(view) });
});
