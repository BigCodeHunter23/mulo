import type { VersusPage } from "@/lib/app-api";
import { appCaller, appJson, appRoute, limitReads } from "@/lib/app-route";
import { NO_TAKES, visibleTakes, yesterdayView } from "@/lib/app-versus";
import { getNominations } from "@/lib/nominations";
import { getTodaysMatchup, getVersusView } from "@/lib/versus";

/**
 * The Versus page (`versus/VersusScreen.tsx`): today's matchup as the caller
 * should see it, its takes, yesterday's result and the nominations. The split
 * and the takes are left out until the caller picks, as on the page.
 */
export const GET = appRoute(async () => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  await limitReads(caller.user);

  const matchup = await getTodaysMatchup();
  if (!matchup) {
    return appJson<VersusPage>({ today: null, takes: NO_TAKES, yesterday: null, nominations: [] });
  }

  const [today, yesterday, nominations] = await Promise.all([
    getVersusView(matchup),
    yesterdayView(matchup.day),
    getNominations(caller.user?.id ?? null),
  ]);

  return appJson<VersusPage>({ today, takes: await visibleTakes(today), yesterday, nominations });
});
