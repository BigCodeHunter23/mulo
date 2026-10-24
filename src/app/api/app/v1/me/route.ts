import type { Me } from "@/lib/app-api";
import { appJson, appRoute, signedInCaller } from "@/lib/app-route";
import { getOwnProfile } from "@/lib/social";

/** Who the app is signed in as, and whether they've finished signing up. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  return appJson<Me>({ ...user, profile: await getOwnProfile(user.id) });
});
