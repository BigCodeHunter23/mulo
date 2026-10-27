import type { NextRequest } from "next/server";
import { z } from "zod";
import { setReaction } from "@/app/reactions/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `setReaction` checks the id, as for the website. */
const reactionBody = z.object({
  kind: z.enum(["album", "artist", "take", "pick"]),
  ratingId: z.number().int(),
  /** 1 loves, -1 says nah, 0 takes it back. */
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

/** A love or a nah on a rating, a Versus pick or a take, or taking one back. */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, reactionBody);
  if (body instanceof Response) return body;

  return appJson<SaveResult>(await setReaction(body.kind, body.ratingId, body.value));
});
