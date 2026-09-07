import { notFound } from "next/navigation";
import {
  getFollowState,
  getProfileByUsername,
  getProfileStats,
} from "@/lib/social";
import { getUserFeed } from "@/lib/feed";
import FollowButton from "@/components/FollowButton";
import FeedItem from "@/components/FeedItem";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="display-sm text-lg tabular-nums text-text">{value}</span>
      <span className="text-xs uppercase tracking-wider text-text-muted">
        {label}
      </span>
    </div>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const [stats, followState, ratings] = await Promise.all([
    getProfileStats(profile.id),
    getFollowState(profile.id),
    getUserFeed(profile.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-10">
        <div className="flex items-start gap-5">
          <Avatar
            url={profile.avatar_url}
            name={profile.display_name || profile.username}
            size="xl"
          />

          <div className="min-w-0 flex-1">
            <h1 className="display text-2xl text-text sm:text-3xl">
              {profile.display_name || profile.username}
            </h1>
            <p className="text-sm text-text-muted">@{profile.username}</p>

            <div className="mt-4 flex flex-wrap gap-6">
              <Stat value={stats.ratings} label="Rated" />
              <Stat value={stats.followers} label="Followers" />
              <Stat value={stats.following} label="Following" />
              {stats.averageScore !== null && (
                <Stat
                  value={stats.averageScore.toFixed(1)}
                  label="Avg score"
                />
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {followState.isSelf ? (
              <ButtonLink href="/profile" variant="secondary" size="sm">
                Edit profile
              </ButtonLink>
            ) : (
              <>
                <FollowButton
                  targetId={profile.id}
                  username={profile.username}
                  signedIn={followState.signedIn}
                  isSelf={followState.isSelf}
                  isFollowing={followState.isFollowing}
                />
                <ReportButton
                  profileId={profile.id}
                  signedIn={followState.signedIn}
                  label="Report"
                />
              </>
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="mt-5 max-w-prose text-sm leading-relaxed text-text-secondary">
            {profile.bio}
          </p>
        )}
      </header>

      <SectionHeading>Ratings</SectionHeading>

      {ratings.length === 0 ? (
        <EmptyState
          title="Nothing rated yet"
          body={
            followState.isSelf
              ? "Find an album and give it a score out of 10."
              : undefined
          }
          action={
            followState.isSelf ? (
              <ButtonLink href="/search">Search music</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {ratings.map((item) => (
            <FeedItem key={item.id} item={item} showAuthor={false} />
          ))}
        </ul>
      )}
    </main>
  );
}
