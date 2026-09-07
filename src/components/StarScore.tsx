/**
 * MULO's signature three-score display.
 *
 * Gold "Ovr"     — the overall community score
 * Red "You"      — the signed-in user's own score
 * Blue "Friends" — the average among people they follow
 *
 * Out of 10 to one decimal place. These are the only saturated colours on a
 * page besides the artwork, which is what makes them read at a glance.
 */

export type ScoreKind = "overall" | "you" | "friends";

const STYLES: Record<ScoreKind, { label: string; color: string }> = {
  overall: { label: "Ovr", color: "text-score-overall" },
  you: { label: "You", color: "text-score-you" },
  friends: { label: "Friends", color: "text-score-friends" },
};

function Star({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2.5l2.9 6.13 6.6.92-4.8 4.76 1.16 6.69L12 17.77l-5.86 3.23L7.3 14.3 2.5 9.55l6.6-.92L12 2.5z" />
    </svg>
  );
}

export function Score({
  kind,
  value,
  count,
  size = "md",
  showLabel = true,
}: {
  kind: ScoreKind;
  value: number | null;
  count?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const style = STYLES[kind];
  const has = value !== null && !Number.isNaN(value);

  const star = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6" }[size];
  const num = { sm: "text-sm", md: "text-xl", lg: "text-3xl" }[size];

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1.5">
        <Star className={`${star} ${has ? style.color : "text-text-muted/40"}`} />
        <span
          className={`display-sm tabular-nums ${num} ${
            has ? "text-text" : "text-text-muted"
          }`}
        >
          {has ? value.toFixed(1) : "—"}
        </span>
      </div>
      {showLabel && (
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
          {style.label}
          {typeof count === "number" && count > 0 && ` · ${count}`}
        </span>
      )}
    </div>
  );
}

export default function StarScore({
  overall,
  overallCount,
  you,
  friends,
  friendsCount,
}: {
  overall: number | null;
  overallCount?: number;
  you: number | null;
  friends: number | null;
  friendsCount?: number;
}) {
  return (
    <div className="flex items-start gap-5 rounded-xl border border-border bg-surface/60 px-5 py-3 backdrop-blur-sm sm:gap-7">
      <Score kind="overall" value={overall} count={overallCount} />
      <div className="w-px self-stretch bg-border" />
      <Score kind="you" value={you} />
      <div className="w-px self-stretch bg-border" />
      <Score kind="friends" value={friends} count={friendsCount} />
    </div>
  );
}
