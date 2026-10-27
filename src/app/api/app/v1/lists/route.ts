import type { NextRequest } from "next/server";
import { z } from "zod";
import { createList } from "@/app/lists/actions";
import type { ListResult, ListsPage } from "@/lib/app-api";
import { appJson, appRoute, limitReads, readBody, signedInCaller } from "@/lib/app-route";
import { getRecentLists, getUserLists } from "@/lib/lists";

/** The shape only; `createList` checks and trims the values, as for the website. */
const newList = z.object({
  title: z.string().max(400),
  description: z.string().max(2000).optional(),
  ranked: z.boolean().optional(),
  releaseMbid: z.string().max(40).optional(),
});

/** The Lists page: yours, then everyone's latest. For people with an account, as the page is. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const [mine, recent] = await Promise.all([getUserLists(user.id), getRecentLists(24)]);
  return appJson<ListsPage>({ mine, recent });
});

/** A new list, optionally starting with an album. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, newList);
  if (body instanceof Response) return body;

  return appJson<ListResult>(await createList(body));
});
