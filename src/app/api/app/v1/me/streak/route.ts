import type { Streak } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getStreak } from "@/lib/streak";

/** Your own streak, for the flame on The Stack (`stack/page.tsx`). */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  return appJson<Streak>(await getStreak(user.id));
});
