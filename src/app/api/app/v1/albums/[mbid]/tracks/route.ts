import type { NextRequest } from "next/server";
import type { AlbumTracks } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, type Params } from "@/lib/app-route";
import { getCachedTracks } from "@/lib/catalog";
import { getSongScores } from "@/lib/ratings";
import { mbidSchema } from "@/lib/validation";

/**
 * An album's tracklist with everyone's, your own and your friends' song
 * scores. The first visit fetches it from MusicBrainz, so the app asks for it
 * apart from the rest of the page, as the website streams it in.
 */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ mbid: string }>) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  const { mbid } = await params;
  if (!mbidSchema.safeParse(mbid).success) return appError(404, "We couldn't find that album.");

  const tracks = await getCachedTracks(mbid);
  const scores = await getSongScores(tracks.flatMap((t) => (t.song_mbid ? [t.song_mbid] : [])));
  return appJson<AlbumTracks>({ tracks, scores });
});
