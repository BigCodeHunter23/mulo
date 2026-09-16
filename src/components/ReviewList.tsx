import Link from "next/link";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import Reactions from "@/components/Reactions";
import type { Review } from "@/lib/reviews";
import { NO_REACTIONS, type ReactionSummary } from "@/lib/reactions";

/** Written reviews with their scores, on album and artist pages. */
export default function ReviewList({
  reviews,
  kind,
  signedIn,
  reactions,
}: {
  reviews: Review[];
  kind: "album" | "artist";
  signedIn: boolean;
  reactions: Record<number, ReactionSummary>;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex items-center gap-2.5">
            <Avatar
              url={review.avatar_url}
              name={review.display_name || review.username}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/u/${review.username}`}
                className="block truncate text-sm font-medium text-text transition-colors hover:text-accent"
              >
                {review.display_name || review.username}
              </Link>
              <span className="text-xs text-text-muted">@{review.username}</span>
            </div>
            <span className="display-sm shrink-0 tabular-nums text-score-you">
              {review.score}
              <span className="text-xs text-text-muted">/10</span>
            </span>
          </div>

          {review.review && (
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {review.review}
            </p>
          )}

          <div className="mt-3.5 flex items-center justify-between gap-3">
            <Reactions
              kind={kind}
              ratingId={review.id}
              summary={reactions[review.id] ?? NO_REACTIONS}
              signedIn={signedIn}
            />
            <ReportButton
              {...(kind === "album"
                ? { ratingId: review.id }
                : { artistRatingId: review.id })}
              signedIn={signedIn}
              label="Report"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
