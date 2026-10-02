import { NextResponse, type NextRequest } from "next/server";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";
import { widerResults } from "@/lib/wider-search";
import { allowAddress } from "@/lib/rate-limit";

/**
 * The whole of MusicBrainz, for the search box as you type. Slower than
 * MULO's own catalogue and sometimes busy, so it's asked separately and the
 * box shows MULO's results first.
 */
export async function GET(request: NextRequest) {
  // Long enough for any real artist or album name; no reason to send more on.
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (query.length < 2) return NextResponse.json({ artists: [], albums: [], failed: false });

  // Every one of these is a request to MusicBrainz, which bans addresses that
  // ask too often. Refused looks like a busy moment: the box says so and moves on.
  if (!(await allowAddress("widerSearch"))) {
    return NextResponse.json(
      { artists: [], albums: [], failed: true },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  const [artists, albums] = await Promise.allSettled([
    searchArtists(query),
    searchReleaseGroups(query),
  ]);
  const failed = artists.status === "rejected" || albums.status === "rejected";

  return NextResponse.json(
    widerResults(
      artists.status === "fulfilled" ? artists.value : [],
      albums.status === "fulfilled" ? albums.value : [],
      failed,
    ),
    {
      headers: {
        // A good answer is the same for anybody for a few minutes, and every
        // one served from the cache is a request MusicBrainz doesn't have to
        // answer. A failed one must never be kept: it once meant a search that
        // hit a busy moment kept failing for everybody for up to an hour.
        "Cache-Control": failed ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
