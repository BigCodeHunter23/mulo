import type { HomeExtras } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getReceipt, howLongAgo } from "@/lib/receipts";
import { getTasteTwin } from "@/lib/taste-twin";

/** Logs a failed extra and shows nothing in its place, as the page's Suspense does. */
function quietly(what: string) {
  return (error: unknown): null => {
    console.error(`[app-api] ${what} failed:`, error);
    return null;
  };
}

/** What Home adds to the feed: this week's taste twin and an old score to look at again. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const [twin, receipt] = await Promise.all([
    getTasteTwin(user.id).catch(quietly("a taste twin")),
    getReceipt(user.id).catch(quietly("a receipt")),
  ]);
  return appJson<HomeExtras>({
    twin,
    receipt: receipt ? { ...receipt, howLongAgo: howLongAgo(receipt.rated_at) } : null,
  });
});
