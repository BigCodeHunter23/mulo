import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedArtist, getCachedArtistAlbums } from "@/lib/catalog";
import { getScoresForReleases } from "@/lib/ratings";
import { Score } from "@/components/StarScore";
import { SectionHeading } from "@/components/ui";

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
    <>
      <div className="relative">
        <div className="backdrop h-[360px]">
          {artist.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.image_url} alt="" aria-hidden="true" />
          )}
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:gap-9">
            {artist.image_url && (
              <div className="artwork h-40 w-40 shrink-0 overflow-hidden rounded-full sm:h-48 sm:w-48">
                {/* Wikimedia Commons photo, served from their CDN. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artist.image_url}
                  alt={artist.name}
                  className="h-full w-full object-cover object-top"
                />
              </div>
            )}

            <div className="min-w-0 pb-2">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Artist
              </p>
              <h1 className="display mt-2 text-4xl text-text sm:text-6xl">
                {artist.name}
              </h1>
              {albums.length > 0 && (
                <p className="mt-3 text-sm text-text-secondary">
                  {albums.length} album{albums.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>

          {artist.bio && (
            <p className="mt-7 max-w-3xl text-sm leading-relaxed text-text-secondary">
              {artist.bio}
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-12 sm:px-6">
        <SectionHeading>Albums</SectionHeading>

        {albums.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No albums found for this artist.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {albums.map((album) => {
              const score = scores.get(album.mbid) ?? null;

              return (
                <li key={album.mbid} className="group">
                  <Link href={`/album/${album.mbid}`} className="block">
                    <div className="artwork aspect-square overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-[1.03]">
                      {album.cover_art_url && (
                        /* Cover Art Archive redirects to archive.org, so
                           Next's optimizer adds nothing here. */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={album.cover_art_url}
                          alt={album.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <p className="display-sm mt-2.5 line-clamp-2 text-sm text-text transition-colors group-hover:text-accent">
                      {album.title}
                    </p>
                  </Link>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs tabular-nums text-text-muted">
                      {album.release_date?.slice(0, 4) ?? "—"}
                    </span>
                    <Score
                      kind="overall"
                      value={score}
                      size="sm"
                      showLabel={false}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
