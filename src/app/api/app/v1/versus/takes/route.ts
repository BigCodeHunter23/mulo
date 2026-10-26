import type { NextRequest } from "next/server";
import { z } from "zod";
import { postTake } from "@/app/versus/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `postTake` holds a take to `TAKE_LIMIT`, as it does for the website. */
const takeBody = z.object({ matchupId: z.number(), body: z.string().max(2000) });

/** Posts your take, exactly as "Post take" on the Versus page does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, takeBody);
  if (body instanceof Response) return body;

  return appJson<SaveResult>(await postTake(body.matchupId, body.body));
});
