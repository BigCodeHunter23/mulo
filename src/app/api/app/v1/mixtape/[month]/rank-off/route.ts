import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveRankOff } from "@/app/u/[username]/mixtape/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller, type Params } from "@/lib/app-route";

/** The shape only; `saveRankOff` checks the month and the record, as it does for the website. */
const rankOffBody = z.object({ kind: z.enum(["album", "song"]), mbid: z.string() });

/** Crowns a rank-off's winner on your own Mixtape, as its last round does. */
export const PUT = appRoute(async (request: NextRequest, { params }: Params<{ month: string }>) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, rankOffBody);
  if (body instanceof Response) return body;

  const { month } = await params;
  return appJson<SaveResult>(await saveRankOff(month, body.kind, body.mbid));
});
