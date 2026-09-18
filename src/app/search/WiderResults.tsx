import Link from "next/link";

export type WiderArtist = { id: string; name: string; disambiguation: string | null };
export type WiderAlbum = { id: string; title: string; artist: string | null; year: string | null };

const ROW =
  "flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover";

/**
 * Everything MusicBrainz has that MULO hasn't cached yet. Used twice: by the
 * server when a search arrives from a link, and by the search box as you type,
 * so both look exactly the same.
 */
export default function WiderResults({
  artists,
  albums,
}: {
  artists: WiderArtist[];
  albums: WiderAlbum[];
}) {
  if (artists.length === 0 && albums.length === 0) return null;

  return (
    <section className="search-wider">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-2.5">
        <h2 className="display-sm text-lg text-text">More results</h2>
      </div>
      <p className="-mt-2 mb-4 text-xs text-text-muted">
        From the wider music database. Open any of them to add it to MULO and be
        the first to rate it.
      </p>

      {artists.length > 0 && (
        <ul className="mb-6 overflow-hidden rounded-xl border border-border">
          {artists.map((artist, i) => (
            <li key={artist.id} className={i % 2 ? "bg-surface/40" : ""}>
              <Link href={`/artist/${artist.id}`} className={ROW}>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text">{artist.name}</span>
                  {artist.disambiguation && (
                    <span className="ml-2 text-sm text-text-muted">{artist.disambiguation}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-text-muted">Artist</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {albums.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border">
          {albums.map((album, i) => (
            <li key={album.id} className={i % 2 ? "bg-surface/40" : ""}>
              <Link href={`/album/${album.id}`} className={ROW}>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text">{album.title}</span>
                  {album.artist && (
                    <span className="ml-2 text-sm text-text-secondary">{album.artist}</span>
                  )}
                </span>
                {album.year && (
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">{album.year}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
