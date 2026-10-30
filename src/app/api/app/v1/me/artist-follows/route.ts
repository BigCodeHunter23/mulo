import type { NextRequest } from "next/server";
import { z } from "zod";
import { followArtists } from "@/app/artist/[mbid]/actions";
import type { ArtistFollowsInput, SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { SUGGESTIONS_MAX } from "@/lib/artist-follows-shared";

const body: z.ZodType<ArtistFollowsInput> = z.object({
  mbids: z.array(z.string().max(36)).min(1).max(SUGGESTIONS_MAX),
});

/** Follows several artists at once, as the suggestions card's Follow these does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const input = await readBody(request, body);
  if (input instanceof Response) return input;
  return appJson<SaveResult>(await followArtists(input.mbids));
});
