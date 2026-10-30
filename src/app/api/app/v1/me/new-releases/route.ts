import type { NewReleasesShelf } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getNewReleases } from "@/lib/releases/shelf";

/** Home's "New from artists you follow", dated on your own clock. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);
  return appJson<NewReleasesShelf>({ releases: await getNewReleases(user.id) });
});
