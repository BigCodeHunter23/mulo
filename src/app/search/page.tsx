import Link from "next/link";
import { searchArtists, searchReleaseGroups } from "@/lib/musicbrainz";

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <form action="/search" className="mb-8 flex gap-2">
        <input
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search artists and albums"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Search
        </button>
      </form>

      {!query && (
        <p className="text-gray-600">
          Search for an artist or album to get started.
        </p>
      )}

      {query && failed && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The music database is busy right now. Please try that search again in
          a moment.
        </p>
      )}

      {query && !failed && artists.length === 0 && albums.length === 0 && (
        <p className="text-gray-600">No results for &ldquo;{query}&rdquo;.</p>
      )}

      {artists.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Artists</h2>
          <ul className="divide-y divide-gray-200">
            {artists.map((artist) => (
              <li key={artist.id}>
                <Link
                  href={`/artist/${artist.id}`}
                  className="block py-2 hover:bg-gray-50"
                >
                  <span className="font-medium">{artist.name}</span>
                  {artist.disambiguation && (
                    <span className="ml-2 text-sm text-gray-500">
                      {artist.disambiguation}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Albums</h2>
          <ul className="divide-y divide-gray-200">
            {albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`/album/${album.id}`}
                  className="block py-2 hover:bg-gray-50"
                >
                  <span className="font-medium">{album.title}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {album["artist-credit"]?.[0]?.artist.name}
                    {album["first-release-date"] &&
                      ` · ${album["first-release-date"].slice(0, 4)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
