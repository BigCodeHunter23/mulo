import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SaveResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  BAD_REQUEST,
  readBody,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { fixAlbum } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";
import { rowIdText } from "@/lib/validation";

/** "Which album is this?": every entry of yours with this one's names. */
export const POST = appRoute(async (request: NextRequest, { params }: Params<{ id: string }>) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const id = rowIdText.safeParse((await params).id);
  if (!id.success) return appError(400, BAD_REQUEST);
  const body = await readBody(request, z.object({ mbid: z.string().max(40) }));
  if (body instanceof Response) return body;
  return appJson<SaveResult>(await fixAlbum(user.id, id.data, body.mbid));
});
