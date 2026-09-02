import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFollowState,
  getProfileByUsername,
  getProfileStats,
} from "@/lib/social";
import { getUserFeed } from "@/lib/feed";
import FollowButton from "@/components/FollowButton";
import FeedItem from "@/components/FeedItem";
import SectionHeading from "@/components/SectionHeading";

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-mulo-navy">
            {profile.display_name || profile.username}
          </h1>
          <p className="text-mulo-orange">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-3 max-w-prose text-gray-700">{profile.bio}</p>
          )}

          <div className="mt-4 flex gap-5 text-sm">
            <span>
              <strong className="tabular-nums">{stats.ratings}</strong>{" "}
              <span className="text-gray-500">rated</span>
            </span>
            <span>
              <strong className="tabular-nums">{stats.followers}</strong>{" "}
              <span className="text-gray-500">
                follower{stats.followers === 1 ? "" : "s"}
              </span>
            </span>
            <span>
              <strong className="tabular-nums">{stats.following}</strong>{" "}
              <span className="text-gray-500">following</span>
            </span>
            {stats.averageScore !== null && (
              <span>
                <strong className="tabular-nums">
                  {stats.averageScore.toFixed(1)}
                </strong>{" "}
                <span className="text-gray-500">avg</span>
              </span>
            )}
          </div>
        </div>

        <FollowButton
          targetId={profile.id}
          username={profile.username}
          signedIn={followState.signedIn}
          isSelf={followState.isSelf}
          isFollowing={followState.isFollowing}
        />
      </header>

      <SectionHeading>Ratings</SectionHeading>

      {ratings.length === 0 ? (
        <p className="text-mulo-muted">
          {followState.isSelf ? (
            <>
              You haven&rsquo;t rated anything yet.{" "}
              <Link href="/search" className="underline">
                Find an album
              </Link>
              .
            </>
          ) : (
            "Nothing rated yet."
          )}
        </p>
      ) : (
        <ul className="flex flex-col">
          {ratings.map((item) => (
            <FeedItem key={item.id} item={item} showAuthor={false} />
          ))}
        </ul>
      )}
    </main>
  );
}
