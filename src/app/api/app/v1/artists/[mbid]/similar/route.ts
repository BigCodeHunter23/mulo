import type { NextRequest } from "next/server";
import type { SimilarArtists } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, type Params } from "@/lib/app-route";
import { similarArtists } from "@/lib/discover";
import { mbidSchema } from "@/lib/validation";

/** Where Next: artists whose records share this one's genres, closest first. */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, "We couldn't find that artist.");
  return appJson<SimilarArtists>({ artists: await similarArtists(mbid, 6) });
});
