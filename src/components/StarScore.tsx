/**
 * MULO's signature three-score display, following the original mockups.
 *
 * Yellow "Ovr"     — the overall community score
 * Red "You"        — the signed-in user's own score
 * Blue "Friends"   — the average among people they follow
 *
 * Out of 10 to one decimal place. Missing scores read "NA", as in the
 * mockups, rather than collapsing the layout.
 */

export type ScoreKind = "overall" | "you" | "friends";

const STYLES: Record<ScoreKind, { label: string; fill: string }> = {
  overall: { label: "Ovr", fill: "text-score-overall" },
  you: { label: "You", fill: "text-score-you" },
  friends: { label: "Friends", fill: "text-score-friends" },
};

function Star({ className, size }: { className: string; size: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${size} ${className}`}
      fill="currentColor"
    >
      <path d="M12 2.5l2.9 6.13 6.6.92-4.8 4.76 1.16 6.69L12 17.77l-5.86 3.23L7.3 14.3 2.5 9.55l6.6-.92L12 2.5z" />
    </svg>
  );
}

export function Score({
  kind,
  value,
  count,
  size = "normal",
  showLabel = true,
}: {
  kind: ScoreKind;
  value: number | null;
  count?: number;
  size?: "normal" | "small";
  showLabel?: boolean;
}) {
  const style = STYLES[kind];
  const hasValue = value !== null && !Number.isNaN(value);

  const starSize = size === "small" ? "h-4 w-4" : "h-7 w-7";
  const numberSize = size === "small" ? "text-base" : "text-2xl";

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-baseline gap-1.5">
        <Star
          className={hasValue ? style.fill : "text-gray-300"}
          size={`${starSize} self-center`}
        />
        <span
          className={`font-display font-semibold tabular-nums ${numberSize} ${
            hasValue ? "text-mulo-navy" : "text-mulo-muted"
          }`}
        >
          {hasValue ? value.toFixed(1) : "NA"}
        </span>
        {hasValue && size === "normal" && (
          <span className="text-xs text-mulo-muted">/10</span>
        )}
      </div>
      {showLabel && (
        <span className="text-[11px] uppercase tracking-wide text-mulo-muted">
          {style.label}
          {typeof count === "number" && count > 0 && ` (${count})`}
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
  size = "normal",
}: {
  overall: number | null;
  overallCount?: number;
  you: number | null;
  friends: number | null;
  friendsCount?: number;
  size?: "normal" | "small";
}) {
  return (
    <div className={`flex items-start ${size === "small" ? "gap-4" : "gap-7"}`}>
      <Score
        kind="overall"
        value={overall}
        count={overallCount}
        size={size}
      />
      <Score kind="you" value={you} size={size} />
      <Score
        kind="friends"
        value={friends}
        count={friendsCount}
        size={size}
      />
    </div>
  );
}
