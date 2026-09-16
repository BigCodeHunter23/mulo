import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFollowState,
  getProfileByUsername,
  getProfileStats,
} from "@/lib/social";
import { getUserFeed } from "@/lib/feed";
import { getTopPicks } from "@/lib/top-picks";
import { createPublicClient } from "@/lib/supabase/public";
import FollowButton from "@/components/FollowButton";
import FeedItem from "@/components/FeedItem";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import TopPicks from "@/components/TopPicks";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const { data } = await createPublicClient()
    .from("profiles")
    .select("username, display_name, bio")
    .eq("username", username)
    .maybeSingle();

  if (!data) return { title: "Profile" };

  const name = String(data.display_name || data.username);
  const title = `${name} (@${data.username})`;
  const description =
    (data.bio as string | null) || `See what ${name} is rating on MULO.`;

  return {
    title,
    description,
    openGraph: { type: "website", siteName: "MULO", title, description },
  };
}

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

  const [stats, followState, ratings, topArtists, topAlbums] = await Promise.all([
    getProfileStats(profile.id),
    getFollowState(profile.id),
    getUserFeed(profile.id),
    getTopPicks(profile.id, "artist"),
    getTopPicks(profile.id, "album"),
  ]);

  const name = profile.display_name || profile.username;
  const hasPicks = topArtists.length > 0 || topAlbums.length > 0;

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

      {hasPicks && (
        <section className="mb-14">
          <SectionHeading
            action={
              followState.isSelf ? (
                <Link
                  href="/goat"
                  className="text-xs text-text-muted transition-colors hover:text-text"
                >
                  Edit
                </Link>
              ) : undefined
            }
          >
            {followState.isSelf ? "Your GOAT" : `${name}'s GOAT`}
          </SectionHeading>

          {topArtists.length > 0 && (
            <>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Artists
              </p>
              <TopPicks picks={topArtists} kind="artist" />
            </>
          )}

          {topAlbums.length > 0 && (
            <div className={topArtists.length > 0 ? "mt-8" : ""}>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Albums
              </p>
              <TopPicks picks={topAlbums} kind="album" />
            </div>
          )}
        </section>
      )}

      {!hasPicks && followState.isSelf && (
        <div className="mb-14">
          <EmptyState
            title="Select your GOAT"
            body="Pick your top ten artists and albums and rank them. Number one wears the crown, on your profile and in the preview when you send someone your link."
            action={<ButtonLink href="/goat">Pick your top ten</ButtonLink>}
          />
        </div>
      )}

      <SectionHeading>Ratings</SectionHeading>

      {ratings.length === 0 ? (
        <EmptyState
          title="Nothing rated yet"
          body={
            followState.isSelf
              ? "Find an artist, album or song and give it a score out of 10."
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
            <FeedItem key={item.key} item={item} showAuthor={false} />
          ))}
        </ul>
      )}
    </main>
  );
}
