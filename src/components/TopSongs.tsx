import Link from "next/link";
import { coverSrc } from "@/lib/cover-url";
import { Score } from "@/components/StarScore";
import type { TopSong } from "@/lib/ratings";

/** An artist's best-rated songs, each linking to the album it's on. */
export default function TopSongs({ songs }: { songs: TopSong[] }) {
  return (
    <ol className="overflow-hidden rounded-xl border border-border">
      {songs.map((song, i) => {
        const cover = coverSrc(song.release.cover_art_url, 250);

        return (
          <li key={song.mbid} className={i % 2 ? "bg-surface/40" : ""}>
            <Link
              href={`/album/${song.release.mbid}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-text-muted">
                {i + 1}
              </span>
              <span className="artwork h-10 w-10 shrink-0 overflow-hidden rounded-md">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">{song.title}</span>
                <span className="block truncate text-xs text-text-muted">
                  {song.release.title}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <Score kind="overall" value={song.average} size="sm" showLabel={false} />
                <span className="text-[10px] text-text-muted">
                  {song.count} rating{song.count === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
