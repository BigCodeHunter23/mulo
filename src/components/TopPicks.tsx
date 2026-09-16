import Link from "next/link";
import type { PickKind, TopPick } from "@/lib/top-picks";

/** The crown above number one. */
function Crown() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className="h-6 w-6 text-score-overall"
    >
      <path d="M3 18h18l1.2-10.2-5.1 3.4L12 3.6 6.9 11.2 1.8 7.8 3 18zm0 2v1.2h18V20H3z" />
    </svg>
  );
}

function Art({
  pick,
  round,
  size,
  className = "",
  eager = false,
}: {
  pick: TopPick;
  round: boolean;
  size: string;
  className?: string;
  /** For the top of the list, which sits above the fold. */
  eager?: boolean;
}) {
  return (
    <span
      className={`artwork block shrink-0 overflow-hidden ${size} ${
        round ? "rounded-full" : "rounded-lg"
      } ${className}`}
    >
      {pick.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pick.image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className={`h-full w-full object-cover ${round ? "object-top" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xl font-bold text-text-muted">
          {pick.title.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * Somebody's ranked top ten: number one crowned and lit, then the runners-up,
 * then the rest. The list rises into place from the bottom, so the eye ends
 * up on number one.
 */
export default function TopPicks({
  picks,
  kind,
}: {
  picks: TopPick[];
  kind: PickKind;
}) {
  if (picks.length === 0) return null;

  const round = kind === "artist";
  const href = (pick: TopPick) =>
    kind === "artist" ? `/artist/${pick.mbid}` : `/album/${pick.mbid}`;

  const [first, ...rest] = picks;
  const runnersUp = rest.slice(0, 2);
  const others = rest.slice(2);
  // Number ten appears first and number one last, a beat apart.
  const delay = (position: number) => ({
    animationDelay: `${(picks.length - position) * 45}ms`,
  });

  return (
    <div className="rounded-2xl border border-border bg-surface/50 px-4 py-7 sm:px-8">
      <div className="goat-reveal flex flex-col items-center text-center" style={delay(1)}>
        <Crown />
        <Link href={href(first)} className="group mt-2.5 block">
          <Art
            pick={first}
            round={round}
            size="h-28 w-28 sm:h-36 sm:w-36"
            className="goat-crown ring-2 ring-score-overall transition-transform group-hover:scale-[1.03]"
            eager
          />
        </Link>
        <Link
          href={href(first)}
          className="display mt-3.5 text-xl text-text transition-colors hover:text-accent sm:text-2xl"
        >
          {first.title}
        </Link>
        {first.subtitle && (
          <span className="mt-0.5 text-sm text-text-muted">{first.subtitle}</span>
        )}
      </div>

      {runnersUp.length > 0 && (
        <ol className="mt-8 flex justify-center gap-8 sm:gap-12">
          {runnersUp.map((pick, i) => (
            <li
              key={pick.mbid}
              className="goat-reveal flex w-24 flex-col items-center text-center sm:w-28"
              style={delay(i + 2)}
            >
              <Link href={href(pick)} className="group block">
                <Art
                  pick={pick}
                  round={round}
                  size="h-20 w-20 sm:h-24 sm:w-24"
                  className="ring-1 ring-border transition-transform group-hover:scale-[1.03]"
                  eager
                />
              </Link>
              <span className="mt-2 text-xs font-bold tabular-nums text-text-muted">
                {i + 2}
              </span>
              <Link
                href={href(pick)}
                className="line-clamp-2 text-sm text-text transition-colors hover:text-accent"
              >
                {pick.title}
              </Link>
            </li>
          ))}
        </ol>
      )}

      {others.length > 0 && (
        <ol className="mx-auto mt-8 max-w-md">
          {others.map((pick, i) => (
            <li
              key={pick.mbid}
              className="goat-reveal border-t border-border/70"
              style={delay(i + 4)}
            >
              <Link
                href={href(pick)}
                className="flex items-center gap-3 py-2 transition-colors hover:text-accent"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-text-muted">
                  {i + 4}
                </span>
                <Art pick={pick} round={round} size="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  {pick.title}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
