/**
 * MULO's signature three-score display.
 *
 * Yellow  — the overall community average
 * Red     — the signed-in user's own score
 * Blue    — the average among people the user follows
 *
 * Scores show out of 10 to one decimal place. A null score renders as a
 * dimmed star with an em dash, so the three always sit in the same places.
 */

export type ScoreKind = "community" | "you" | "following";

const STYLES: Record<
  ScoreKind,
  { label: string; fill: string; text: string }
> = {
  community: {
    label: "Community",
    fill: "text-yellow-400",
    text: "text-gray-900",
  },
  you: { label: "You", fill: "text-red-500", text: "text-gray-900" },
  following: {
    label: "Following",
    fill: "text-blue-500",
    text: "text-gray-900",
  },
};

function Star({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-6 w-6 ${className}`}
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
}: {
  kind: ScoreKind;
  value: number | null;
  count?: number;
}) {
  const style = STYLES[kind];
  const hasValue = value !== null && !Number.isNaN(value);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1.5">
        <Star className={hasValue ? style.fill : "text-gray-300"} />
        <span
          className={`text-lg font-semibold tabular-nums ${
            hasValue ? style.text : "text-gray-400"
          }`}
        >
          {hasValue ? value.toFixed(1) : "—"}
        </span>
      </div>
      <span className="text-xs text-gray-500">
        {style.label}
        {typeof count === "number" && count > 0 && ` (${count})`}
      </span>
    </div>
  );
}

export default function StarScore({
  community,
  communityCount,
  you,
  following,
  followingCount,
}: {
  community: number | null;
  communityCount?: number;
  you: number | null;
  following: number | null;
  followingCount?: number;
}) {
  return (
    <div className="flex items-start gap-6">
      <Score kind="community" value={community} count={communityCount} />
      <Score kind="you" value={you} />
      <Score kind="following" value={following} count={followingCount} />
    </div>
  );
}
