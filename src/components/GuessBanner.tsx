import Link from "next/link";

/** A way into Guess the score from the home and Discover pages. */
export default function GuessBanner() {
  return (
    <Link
      href="/guess"
      className="drop-banner group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-score-overall/50 sm:p-5"
    >
      <span className="display flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-score-overall/40 bg-score-overall/10 text-xl tabular-nums text-score-overall transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
        ?.?
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-score-overall">
          Game
        </span>
        <span className="display-sm block text-lg text-text">Guess the score</span>
        <span className="block text-sm text-text-secondary">
          Ten records. How well do you know the crowd?
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-text-muted transition-transform group-hover:translate-x-1">
        &rarr;
      </span>
    </Link>
  );
}
