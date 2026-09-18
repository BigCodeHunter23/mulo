import Link from "next/link";
import type { SetProgress } from "@/lib/gauntlet";

/**
 * How much of an artist's discography somebody has rated, and the way to
 * finish it.
 *
 * "4 of 7" is an itch. Seven empty notches with four filled in is a bigger
 * one. It leads straight into The Gauntlet, and once the set is done, to the
 * ranking that comes out of it.
 */
export default function FinishTheSet({
  artistMbid,
  artistName,
  progress,
  rankingHref,
}: {
  artistMbid: string;
  artistName: string;
  progress: SetProgress;
  rankingHref: string | null;
}) {
  const { total, rated } = progress;
  if (total < 2) return null;

  const done = rated === total;
  const percent = Math.round((rated / total) * 100);

  return (
    <div className="finish-set mb-8 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-raised to-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            {done ? "Set complete" : rated === 0 ? "The Gauntlet" : "Finish the set"}
          </p>
          <p className="display mt-1 text-2xl text-text">
            {done ? (
              <>Every {artistName} album, rated.</>
            ) : rated === 0 ? (
              <>Rate all {total} and get your ranking.</>
            ) : (
              <>
                {rated} <span className="text-text-muted">of {total} rated</span>
              </>
            )}
          </p>
        </div>

        {done && rankingHref ? (
          <Link
            href={rankingHref}
            className="rounded-full bg-score-overall px-4 py-2 text-sm font-semibold text-bg transition-transform active:scale-95"
          >
            Your ranking &rarr;
          </Link>
        ) : (
          <Link
            href={`/artist/${artistMbid}/gauntlet`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg transition-transform active:scale-95"
          >
            {rated === 0 ? "Run the Gauntlet" : `Rate the last ${total - rated}`} &rarr;
          </Link>
        )}
      </div>

      {/* One notch per album, filling in as they're rated */}
      <div
        className="mt-4 flex gap-1"
        role="img"
        aria-label={`${rated} of ${total} albums rated (${percent}%)`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`finish-notch h-1.5 flex-1 rounded-full ${
              i < rated ? (done ? "bg-score-overall" : "bg-score-you") : "bg-surface-hover"
            }`}
            style={{ "--at": `${i * 0.04}s` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
