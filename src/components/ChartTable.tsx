import Link from "next/link";
import type { Chart, ChartProgress } from "@/lib/charts";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { Star } from "@/components/StarScore";

/**
 * A chart, as a numbered list.
 *
 * The count on the left is the point of the page: a rank is a claim, and
 * scrolling a hundred of them is the closest MULO gets to browsing a record
 * shop. Anything the signed-in person has already rated carries their own
 * score in red beside the crowd's gold, so the list doubles as a checklist of
 * what they've heard and what they haven't.
 */

function Rank({ rank }: { rank: number }) {
  return (
    <span
      className={`display w-8 shrink-0 text-right tabular-nums sm:w-10 ${
        rank <= 3 ? "text-xl text-score-overall sm:text-2xl" : "text-lg text-text-muted sm:text-xl"
      }`}
    >
      {rank}
    </span>
  );
}

function Art({
  src,
  alt,
  round,
}: {
  src: string | null;
  alt: string;
  round: boolean;
}) {
  return (
    <div
      className={`artwork h-14 w-14 shrink-0 overflow-hidden sm:h-16 sm:w-16 ${
        round ? "rounded-full" : "rounded-md"
      }`}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

export default function ChartTable({
  chart,
  progress,
}: {
  chart: Chart;
  progress: ChartProgress;
}) {
  const artists = chart.kind === "artists";

  return (
    <ol className="flex flex-col divide-y divide-border/70 border-y border-border/70">
      {chart.entries.map((entry) => {
        const yours = progress.yours.get(entry.mbid);
        const src = artists
          ? artistPhotoSrc(entry.coverUrl, 300)
          : coverSrc(entry.coverUrl, 250);
        const detail = [entry.subtitle, entry.year].filter(Boolean).join(" · ");

        return (
          <li key={entry.mbid}>
            <Link
              href={entry.href}
              className="group flex items-center gap-3 py-3 pr-1 transition-colors hover:bg-surface-hover/60 sm:gap-4"
            >
              <Rank rank={entry.rank} />
              <Art src={src} alt={entry.title} round={artists} />

              <div className="min-w-0 flex-1">
                <p className="display-sm line-clamp-1 text-sm text-text transition-colors group-hover:text-accent sm:text-base">
                  {entry.title}
                </p>
                {detail && (
                  <p className="mt-0.5 truncate text-xs text-text-muted">{detail}</p>
                )}
                <p className="mt-1 text-[11px] text-text-muted/80">
                  {entry.votes} {entry.votes === 1 ? "rating" : "ratings"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2.5 sm:gap-5">
                <span className="flex w-[3.25rem] items-center justify-end gap-1.5 sm:w-12">
                  <Star className="h-4 w-4 shrink-0 text-score-overall" />
                  <span className="display-sm tabular-nums text-base text-text sm:text-lg">
                    {entry.average.toFixed(1)}
                  </span>
                </span>

                <span className="w-8 text-right sm:w-12">
                  {yours === undefined ? (
                    <span
                      className="text-sm text-text-muted/50"
                      title="You haven't rated this yet"
                      aria-label="Not rated by you"
                    >
                      —
                    </span>
                  ) : (
                    <span
                      className="display-sm tabular-nums text-base text-score-you"
                      title={`You gave it ${yours}`}
                    >
                      {yours.toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
