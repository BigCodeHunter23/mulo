import type { NextRequest } from "next/server";
import { setArtistFollowing } from "@/app/artist/[mbid]/actions";
import type { ArtistFollowResult } from "@/lib/app-api";
import { appJson, appRoute, signedInCaller, type Params } from "@/lib/app-route";

/** Follows an artist, as the button on their page does. */
export const POST = appRoute(
  async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    return appJson<ArtistFollowResult>(await setArtistFollowing((await params).mbid, true));
  },
);

/** Unfollows them. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    return appJson<ArtistFollowResult>(await setArtistFollowing((await params).mbid, false));
  },
);
