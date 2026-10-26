import type { NextRequest } from "next/server";
import type { RankingPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND, visibleProfile } from "@/lib/app-profile";
import { getCachedArtist } from "@/lib/catalog";
import { getRanking } from "@/lib/gauntlet";
import { mbidSchema } from "@/lib/validation";

const NO_ARTIST = "We couldn't find that artist.";

/** Somebody's ranking of an artist's albums (`u/[username]/ranks/[artist]`). */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ username: string; artist: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { username, artist: mbid } = await params;
    if (!mbidSchema.safeParse(mbid).success) return appError(404, NO_ARTIST);
    const [profile, artist] = await Promise.all([visibleProfile(username), getCachedArtist(mbid)]);
    if (!profile) return appError(404, PERSON_NOT_FOUND);
    if (!artist) return appError(404, NO_ARTIST);

    const { ranked, total } = await getRanking(profile.id, mbid);
    return appJson<RankingPage>({
      profile,
      isSelf: caller.user?.id === profile.id,
      artist: { mbid, name: artist.name },
      ranked,
      total,
    });
  },
);
