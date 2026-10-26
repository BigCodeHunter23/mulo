import type { NextRequest } from "next/server";
import type { GauntletPage } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { getCachedArtist } from "@/lib/catalog";
import { getGauntletRun } from "@/lib/gauntlet";
import { mbidSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find that artist.";

/**
 * The albums an artist's Gauntlet still has to get through, oldest first
 * (`artist/[mbid]/gauntlet`). Rating them is ordinary rating.
 */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, NOT_FOUND);
  const artist = await getCachedArtist(mbid);
  if (!artist) return appError(404, NOT_FOUND);

  const { run, total } = await getGauntletRun(user.id, mbid, artist.name);
  return appJson<GauntletPage>({ artist: { mbid, name: artist.name }, run, total });
});
