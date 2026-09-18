import type { Metadata } from "next";
import { Suspense } from "react";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";
import { searchCatalog } from "@/lib/search";
import { artistsToExplore, mostPlayedAlbums } from "@/lib/discover";
import SearchClient from "./SearchClient";
import WiderResults from "./WiderResults";
import { widerResults } from "@/lib/wider-search";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q?.trim() ? `Search: ${q.trim()}` : "Search" };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  // Before anything's typed, there's something to tap straight away.
  const [results, artists, albums] = await Promise.all([
    searchCatalog(query, 8),
    artistsToExplore(12),
    mostPlayedAlbums(10),
  ]);

  const known = [
    ...results.artists.map((a) => a.mbid),
    ...results.albums.map((a) => a.mbid),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SearchClient
        key={query}
        initialQuery={query}
        initialResults={results}
        browse={{
          artists: artists.map((artist) => ({
            mbid: artist.mbid,
            name: artist.name,
            image_url: artist.image_url,
          })),
          albums: albums.map((album) => ({
            mbid: album.mbid,
            title: album.title,
            artist: album.artist,
            year: album.year,
            cover_art_url: album.cover_art_url,
          })),
        }}
      >
        {query.length >= 2 && (
          <Suspense
            fallback={
              <p className="text-sm text-text-muted">
                Looking further afield on MusicBrainz…
              </p>
            }
          >
            <MoreFromMusicBrainz query={query} known={known} />
          </Suspense>
        )}
      </SearchClient>
    </main>
  );
}

/**
 * Results from all of MusicBrainz that MULO hasn't cached yet. Slower, and
 * sometimes busy, so it streams in after the page rather than holding it up.
 */
async function MoreFromMusicBrainz({
  query,
  known,
}: {
  query: string;
  known: string[];
}) {
  const skip = new Set(known);

  // Either lookup can fail when MusicBrainz is busy; show whatever succeeded.
  const [artistResult, albumResult] = await Promise.allSettled([
    searchArtists(query),
    searchReleaseGroups(query),
  ]);
  const failed =
    artistResult.status === "rejected" || albumResult.status === "rejected";
  const artists = artistResult.status === "fulfilled" ? artistResult.value : [];
  const albums = albumResult.status === "fulfilled" ? albumResult.value : [];

  const wider = widerResults(
    artists.filter((a) => !skip.has(a.id)).slice(0, 6),
    albums.filter((a) => !skip.has(a.id)).slice(0, 10),
    failed,
  );

  if (wider.artists.length === 0 && wider.albums.length === 0) {
    return failed ? (
      <p className="rounded-lg border border-score-overall/30 bg-score-overall/10 px-3 py-2 text-sm text-[#f3d98a]">
        The wider music database is busy right now, so these are MULO&rsquo;s
        results only. Try again in a moment for more.
      </p>
    ) : null;
  }

  return <WiderResults artists={wider.artists} albums={wider.albums} />;
}
