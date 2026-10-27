import type { NextRequest } from "next/server";
import { z } from "zod";
import { castVote } from "@/app/versus/actions";
import type { PickResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { rowIdSchema } from "@/lib/validation";

const pickBody = z.object({ matchupId: rowIdSchema, pick: z.enum(["left", "right"]) });

/** Picks a side, exactly as the Pick button on the Versus card does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, pickBody);
  if (body instanceof Response) return body;

  return appJson<PickResult>(await castVote(body.matchupId, body.pick));
});
