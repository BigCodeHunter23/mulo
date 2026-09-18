import type { Streak } from "@/lib/streak";

/**
 * A streak, as a flame with a number in it.
 *
 * Lit and flickering once today counts. Still lit but steady, with a nudge,
 * when the streak is alive but today hasn't happened yet — the one moment a
 * streak actually changes what somebody does. Nothing at all under two days:
 * a one-day streak is just a day.
 */
export default function StreakFlame({
  streak,
  isSelf,
  size = "md",
}: {
  streak: Streak;
  /** Only your own streak gets the nudge; nobody else's is your business. */
  isSelf: boolean;
  size?: "sm" | "md";
}) {
  if (streak.days < 2) return null;

  const atRisk = isSelf && !streak.today;
  const flame = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div
      className={`streak inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
        atRisk
          ? "border-score-overall/40 bg-score-overall/[0.08]"
          : "border-accent/40 bg-accent/[0.1]"
      }`}
      title={`Longest: ${streak.best} days`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${flame} ${streak.today ? "streak-flicker text-accent" : "text-score-overall"}`}
        fill="currentColor"
      >
        <path d="M12 2.5c.6 3.2 2.6 4.9 4.3 6.8 1.6 1.8 2.7 3.8 2.7 6.2A7 7 0 0 1 5 15.5c0-2.3 1-4.2 2.6-5.7-.1 1.8.6 3.2 1.9 3.9-.3-3.6 1.1-7.4 2.5-11.2z" />
        <path
          d="M12 12.5c.3 1.5 1.3 2.3 2 3.2.6.8 1 1.6 1 2.5a3 3 0 0 1-6 0c0-1 .4-1.8 1.1-2.5 0 .8.4 1.4 1 1.6-.1-1.6.4-3.2.9-4.8z"
          className="fill-bg/40"
        />
      </svg>
      <span className="text-sm font-semibold tabular-nums text-text">
        {streak.days}
        <span className="ml-1 font-normal text-text-secondary">day streak</span>
      </span>
      {atRisk && (
        <span className="text-xs text-score-overall">&middot; keep it going today</span>
      )}
    </div>
  );
}
