import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveRaisedOn } from "@/app/raised-on/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `saveRaisedOn` checks the album, decade and scene, as for the website. */
const raisedOnBody = z.object({
  mbid: z.string().max(40),
  era: z.string().max(40).nullable(),
  scene: z.string().max(40).nullable(),
  useAsPicture: z.boolean(),
});

/**
 * The record somebody was raised on. It becomes their picture when they have
 * no photo, when their picture is already a record, or when they ask.
 */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, raisedOnBody);
  if (body instanceof Response) return body;

  return appJson<SaveResult>(await saveRaisedOn(body));
});
