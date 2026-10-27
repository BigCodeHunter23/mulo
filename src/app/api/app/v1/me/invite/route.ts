import { getInviteLink } from "@/app/invite/actions";
import type { InviteResult } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { siteUrl } from "@/lib/site";

/**
 * The caller's invite link, made the first time they ask, as the whole
 * address: whoever it's sent to joins on the website.
 */
export const POST = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const link = await getInviteLink();
  return appJson<InviteResult>(link.ok ? { ok: true, url: `${siteUrl()}${link.path}` } : link);
});
