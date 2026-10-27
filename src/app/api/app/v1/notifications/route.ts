import type { NotificationsPage } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getNotifications } from "@/lib/notifications";
import { getFollowingIds } from "@/lib/social";

/**
 * What's happened lately, as the notifications page shows it, and who the
 * caller already follows, so a new follower gets a Follow back only when
 * they don't. When they last looked is kept on the phone.
 */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const [notifications, following] = await Promise.all([
    getNotifications(user.id),
    getFollowingIds(user.id),
  ]);
  return appJson<NotificationsPage>({ notifications, following });
});
