import Link from "next/link";
import { getTasteTwin } from "@/lib/taste-twin";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { SectionHeading } from "@/components/ui";

/**
 * The person whose scores sit closest to yours this week, on the home page.
 * Hides itself until there's somebody with enough in common to mean it.
 */
export default async function TasteTwin({ userId }: { userId: string }) {
  const twin = await getTasteTwin(userId);
  if (!twin) return null;

  const name = twin.displayName || twin.username;

  return (
    <section>
      <SectionHeading>Your taste twin this week</SectionHeading>
      <div className="relative overflow-hidden rounded-xl border border-accent/30 bg-accent/[0.06] p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <Link href={`/u/${twin.username}`} className="shrink-0">
            <Avatar url={twin.avatarUrl} name={name} size="lg" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/u/${twin.username}`}
              className="block truncate font-medium text-text transition-colors hover:text-accent"
            >
              {name}
            </Link>
            <p className="mt-0.5 text-sm text-text-secondary">
              <span className="display text-lg text-accent">{twin.percent}%</span> taste match
              <span className="text-text-muted"> · {twin.shared} in common</span>
            </p>
          </div>
          <FollowButton
            targetId={twin.id}
            username={twin.username}
            signedIn
            isSelf={false}
            isFollowing={twin.following}
            size="small"
          />
        </div>
        {twin.agreement && (
          <p className="mt-3 border-t border-accent/20 pt-3 text-sm text-text-secondary">
            {twin.agreement.yours === twin.agreement.theirs ? (
              <>
                You both gave{" "}
                <Link href={twin.agreement.href} className="font-medium text-text hover:text-accent">
                  {twin.agreement.title}
                </Link>{" "}
                a <span className="font-semibold text-score-overall">{twin.agreement.yours}</span>.
              </>
            ) : (
              <>
                <Link href={twin.agreement.href} className="font-medium text-text hover:text-accent">
                  {twin.agreement.title}
                </Link>
                : you <span className="font-semibold text-score-you">{twin.agreement.yours}</span>,
                them <span className="font-semibold text-score-friends">{twin.agreement.theirs}</span>.
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
