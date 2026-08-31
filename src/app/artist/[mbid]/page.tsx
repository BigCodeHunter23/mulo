import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedArtist, getCachedArtistAlbums } from "@/lib/catalog";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  const artist = await getCachedArtist(mbid);
  if (!artist) notFound();

  const albums = await getCachedArtistAlbums(mbid);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{artist.name}</h1>
        {artist.bio && <p className="mt-1 text-gray-600">{artist.bio}</p>}
      </header>

      <h2 className="mb-4 text-lg font-bold">
        Albums {albums.length > 0 && `(${albums.length})`}
      </h2>

      {albums.length === 0 ? (
        <p className="text-gray-600">No albums found for this artist.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {albums.map((album) => (
            <li key={album.mbid}>
              <Link href={`/album/${album.mbid}`} className="group block">
                <div className="aspect-square overflow-hidden rounded bg-gray-100">
                  {album.cover_art_url && (
                    /* Plain img: Cover Art Archive redirects to archive.org,
                       so Next's image optimizer adds nothing here. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={album.cover_art_url}
                      alt={album.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="mt-2 text-sm font-medium group-hover:underline">
                  {album.title}
                </p>
                {album.release_date && (
                  <p className="text-sm text-gray-500">
                    {album.release_date.slice(0, 4)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
