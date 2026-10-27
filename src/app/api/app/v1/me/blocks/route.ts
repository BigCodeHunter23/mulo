import type { BlockedPerson } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { listBlocked } from "@/lib/blocks";

/** Who the caller has blocked, newest first, for the account page. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  return appJson<BlockedPerson[]>(await listBlocked());
});
