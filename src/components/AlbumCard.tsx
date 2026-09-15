import Link from "next/link";
import { coverSrc } from "@/lib/cover-url";
import { Score } from "@/components/StarScore";

/** Cover, title and a line of detail, for album grids across the site. */
export default function AlbumCard({
  mbid,
  title,
  artist,
  year,
  coverUrl,
  score,
  eager = false,
}: {
  mbid: string;
  title: string;
  artist?: string | null;
  year?: string | null;
  coverUrl: string | null;
  /** Pass a value (or null for unrated) to show the overall score. */
  score?: number | null;
  /** For the first row of a page, so it isn't held back by lazy loading. */
  eager?: boolean;
}) {
  const src = coverSrc(coverUrl, 250);
  const detail = [artist, year].filter(Boolean).join(" · ");

  return (
    <Link href={`/album/${mbid}`} className="group block">
      <div className="artwork aspect-square overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-[1.03]">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title}
            loading={eager ? "eager" : "lazy"}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <p className="display-sm mt-2.5 line-clamp-1 text-sm text-text transition-colors group-hover:text-accent">
        {title}
      </p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-text-muted">{detail}</span>
        {score !== undefined && (
          <Score kind="overall" value={score} size="sm" showLabel={false} />
        )}
      </div>
    </Link>
  );
}
