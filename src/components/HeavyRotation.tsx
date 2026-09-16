import Link from "next/link";
import type { HeavyRotation as Rotation } from "@/lib/trending";
import { Star } from "@/components/StarScore";
import { SectionHeading } from "@/components/ui";

function Record() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function Meta({ people, average }: { people: number; average: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-text-secondary">
      {people > 1 && <span className="mr-1 text-text-muted">{people} people</span>}
      <Star className="h-3 w-3 text-score-overall" />
      {average.toFixed(1)}
    </span>
  );
}

/**
 * What MULO has in heavy rotation. The full grid heads Discover; the compact
 * row sits above a busy feed without pushing it down the page.
 */
export default function HeavyRotation({
  rotation,
  compact = false,
}: {
  rotation: Rotation;
  compact?: boolean;
}) {
  const when = rotation.label === "this week" ? "This week" : "This month";

  const heading = (
    <SectionHeading
      action={
        compact ? (
          <Link
            href="/discover"
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            More →
          </Link>
        ) : (
          <span className="text-xs text-text-muted">{when}</span>
        )
      }
    >
      <span className="flex items-center gap-2">
        <Record />
        Heavy Rotation
      </span>
    </SectionHeading>
  );

  if (compact) {
    return (
      <section className="mb-10">
        {heading}
        <ol className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {rotation.albums.map((album, i) => (
            <li key={album.mbid} className="w-28 shrink-0 sm:w-32">
              <Link href={`/album/${album.mbid}`} className="group block">
                <span className="artwork relative block aspect-square overflow-hidden rounded-lg transition-transform group-hover:scale-[1.03]">
                  {album.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={album.cover}
                      alt=""
                      loading={i < 4 ? "eager" : "lazy"}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-bg/80 px-1.5 text-[11px] font-bold tabular-nums text-accent">
                    {i + 1}
                  </span>
                </span>
                <span className="display-sm mt-2 block truncate text-xs text-text transition-colors group-hover:text-accent">
                  {album.title}
                </span>
                <span className="block truncate text-[11px] text-text-muted">
                  {album.artist}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section>
      {heading}
      <ol className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
        {rotation.albums.map((album, i) => (
          <li key={album.mbid}>
            <Link href={`/album/${album.mbid}`} className="group block">
              <span className="artwork relative block aspect-square overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-[1.03]">
                {album.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={album.cover}
                    alt={album.title}
                    loading={i < 5 ? "eager" : "lazy"}
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute left-2 top-2 rounded-md bg-bg/80 px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
                  {i + 1}
                </span>
              </span>
              <span className="display-sm mt-2.5 block truncate text-sm text-text transition-colors group-hover:text-accent">
                {album.title}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-text-muted">{album.artist}</span>
                <Meta people={album.people} average={album.average} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
