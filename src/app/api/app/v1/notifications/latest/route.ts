import type { LatestNotification } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getLatestNotificationAt } from "@/lib/notifications";

/** The newest notification's time, for the dot on the bell: the website's own check. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  return appJson<LatestNotification>({ latest: await getLatestNotificationAt(user.id) });
});
