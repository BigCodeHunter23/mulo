import type { NextRequest } from "next/server";
import { z } from "zod";
import { postReply } from "@/app/replies/actions";
import type { ReplyResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { rowIdSchema } from "@/lib/validation";

/** The shape only; `postReply` holds a reply to its rules, as it does for the website. */
const replyBody = z.object({
  kind: z.enum(["album", "artist", "take"]),
  targetId: rowIdSchema,
  body: z.string().max(5000),
});

/** Answers a review or take, exactly as "Post reply" on its thread page does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, replyBody);
  if (body instanceof Response) return body;

  return appJson<ReplyResult>(await postReply(body.kind, body.targetId, body.body));
});
