import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";
import { searchCatalog } from "@/lib/search";
import { mostPlayedAlbums, popularArtists } from "@/lib/discover";
import { SectionHeading } from "@/components/ui";
import SearchClient from "./SearchClient";

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
    popularArtists(12),
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

  const moreArtists = artists.filter((a) => !skip.has(a.id)).slice(0, 6);
  const moreAlbums = albums.filter((a) => !skip.has(a.id)).slice(0, 10);

  if (moreArtists.length === 0 && moreAlbums.length === 0) {
    return failed ? (
      <p className="rounded-lg border border-score-overall/30 bg-score-overall/10 px-3 py-2 text-sm text-[#f3d98a]">
        The wider music database is busy right now, so these are MULO&rsquo;s
        results only. Try again in a moment for more.
      </p>
    ) : null;
  }

  const row =
    "flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover";

  return (
    <section>
      <SectionHeading>More from MusicBrainz</SectionHeading>
      <p className="-mt-2 mb-4 text-xs text-text-muted">
        Not in MULO yet. Opening one adds it.
      </p>

      {moreArtists.length > 0 && (
        <ul className="mb-6 overflow-hidden rounded-xl border border-border">
          {moreArtists.map((artist, i) => (
            <li key={artist.id} className={i % 2 ? "bg-surface/40" : ""}>
              <Link href={`/artist/${artist.id}`} className={row}>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text">{artist.name}</span>
                  {artist.disambiguation && (
                    <span className="ml-2 text-sm text-text-muted">
                      {artist.disambiguation}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-text-muted">Artist</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {moreAlbums.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border">
          {moreAlbums.map((album, i) => (
            <li key={album.id} className={i % 2 ? "bg-surface/40" : ""}>
              <Link href={`/album/${album.id}`} className={row}>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text">{album.title}</span>
                  <span className="ml-2 text-sm text-text-secondary">
                    {album["artist-credit"]?.[0]?.artist.name}
                  </span>
                </span>
                {album["first-release-date"] && (
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">
                    {album["first-release-date"].slice(0, 4)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
