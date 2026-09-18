import { NextResponse, type NextRequest } from "next/server";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";
import { widerResults } from "@/lib/wider-search";

/**
 * The whole of MusicBrainz, for the search box as you type. Slower than
 * MULO's own catalogue and sometimes busy, so it's asked separately and the
 * box shows MULO's results first.
 */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ artists: [], albums: [], failed: false });

  const [artists, albums] = await Promise.allSettled([
    searchArtists(query),
    searchReleaseGroups(query),
  ]);

  return NextResponse.json(
    widerResults(
      artists.status === "fulfilled" ? artists.value : [],
      albums.status === "fulfilled" ? albums.value : [],
      artists.status === "rejected" || albums.status === "rejected",
    ),
    {
      headers: {
        // The same search from anybody within a few minutes is the same answer,
        // and every one saved is a request MusicBrainz doesn't have to answer.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
