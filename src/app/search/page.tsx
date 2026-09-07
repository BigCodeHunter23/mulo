import Link from "next/link";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";
import { buttonClass, fieldClass, SectionHeading } from "@/components/ui";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  // MusicBrainz throttles search and returns 503 when busy. Degrade to a
  // friendly message rather than crashing the page.
  let failed = false;
  const [artists, albums] = query
    ? await Promise.all([
        searchArtists(query).catch(() => {
          failed = true;
          return [];
        }),
        searchReleaseGroups(query).catch(() => {
          failed = true;
          return [];
        }),
      ])
    : [[], []];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <form action="/search" className="mb-10 flex gap-2">
        <input
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search artists and albums"
          autoComplete="off"
          className={fieldClass}
        />
        <button type="submit" className={buttonClass()}>
          Search
        </button>
      </form>

      {!query && (
        <p className="text-sm text-text-secondary">
          Search for an artist or an album to get started.
        </p>
      )}

      {query && failed && (
        <p className="rounded-lg border border-score-overall/30 bg-score-overall/10 px-3 py-2 text-sm text-[#f3d98a]">
          The music database is busy right now. Try that search again in a
          moment.
        </p>
      )}

      {query && !failed && artists.length === 0 && albums.length === 0 && (
        <p className="text-sm text-text-secondary">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {artists.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Artists</SectionHeading>
          <ul className="overflow-hidden rounded-xl border border-border">
            {artists.slice(0, 8).map((artist, i) => (
              <li key={artist.id}>
                <Link
                  href={`/artist/${artist.id}`}
                  className={`flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                    i % 2 ? "bg-surface/40" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="font-medium text-text">{artist.name}</span>
                    {artist.disambiguation && (
                      <span className="ml-2 text-sm text-text-muted">
                        {artist.disambiguation}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    View →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <SectionHeading>Albums</SectionHeading>
          <ul className="overflow-hidden rounded-xl border border-border">
            {albums.map((album, i) => (
              <li key={album.id}>
                <Link
                  href={`/album/${album.id}`}
                  className={`flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                    i % 2 ? "bg-surface/40" : ""
                  }`}
                >
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
        </section>
      )}
    </main>
  );
}
