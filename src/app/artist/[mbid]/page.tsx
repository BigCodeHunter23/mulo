import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedArtist, getCachedArtistAlbums } from "@/lib/catalog";
import { getScoresForReleases } from "@/lib/ratings";
import { Score } from "@/components/StarScore";
import SectionHeading from "@/components/SectionHeading";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  const artist = await getCachedArtist(mbid);
  if (!artist) notFound();

  const albums = await getCachedArtistAlbums(mbid);
  const scores = await getScoresForReleases(albums.map((a) => a.mbid));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-bold leading-tight text-mulo-navy">
          {artist.name}
        </h1>
        {artist.bio && (
          <p className="mt-2 max-w-prose text-mulo-muted">{artist.bio}</p>
        )}
      </header>

      <SectionHeading>
        Albums{albums.length > 0 && ` (${albums.length})`}
      </SectionHeading>

      {albums.length === 0 ? (
        <p className="text-mulo-muted">No albums found for this artist.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
          {albums.map((album) => {
            const score = scores.get(album.mbid) ?? null;

            return (
              <li key={album.mbid}>
                <Link href={`/album/${album.mbid}`} className="group block">
                  <div className="aspect-square overflow-hidden bg-gray-100">
                    {album.cover_art_url && (
                      /* Plain img: Cover Art Archive redirects to
                         archive.org, so Next's optimizer adds nothing. */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={album.cover_art_url}
                        alt={album.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-2 font-display text-base font-medium leading-snug text-mulo-navy group-hover:underline">
                    {album.title}
                  </p>
                </Link>

                <div className="mt-1 flex items-baseline justify-between">
                  {album.release_date && (
                    <span className="text-sm text-mulo-muted">
                      {album.release_date.slice(0, 4)}
                    </span>
                  )}
                  <Score
                    kind="overall"
                    value={score}
                    size="small"
                    showLabel={false}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
