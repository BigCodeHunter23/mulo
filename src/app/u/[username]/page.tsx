import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getFollowState,
  getProfileByUsername,
  getProfileStats,
} from "@/lib/social";
import { getUserFeed } from "@/lib/feed";
import { getTopPicks } from "@/lib/top-picks";
import { getBadges } from "@/lib/badges";
import { getSound } from "@/lib/sound";
import { getTasteMatch } from "@/lib/taste";
import { getHighestRatedAlbums } from "@/lib/ratings";
import { createPublicClient } from "@/lib/supabase/public";
import AlbumCard from "@/components/AlbumCard";
import Badges from "@/components/Badges";
import FollowButton from "@/components/FollowButton";
import FeedItem from "@/components/FeedItem";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import InviteButton from "@/components/InviteButton";
import ShareButton from "@/components/ShareButton";
import TopPicks from "@/components/TopPicks";
import { SkeletonRows } from "@/components/Skeleton";
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

/**
 * A profile waits only for what its header shows. The GOAT list, badges, taste
 * match, top shelf and ratings each stream in underneath as they're ready, so
 * the slowest of them never holds up the page.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const [stats, followState] = await Promise.all([
    getProfileStats(profile.id),
    getFollowState(profile.id),
  ]);

  const name = profile.display_name || profile.username;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-10">
        <div className="flex items-start gap-5">
          <Avatar url={profile.avatar_url} name={name} size="xl" />

          <div className="min-w-0 flex-1">
            <h1 className="display text-2xl text-text sm:text-3xl">{name}</h1>
            <p className="text-sm text-text-muted">@{profile.username}</p>

            <div className="mt-4 flex flex-wrap gap-6">
              <Stat value={stats.ratings} label="Rated" />
              <Stat value={stats.followers} label="Followers" />
              <Stat value={stats.following} label="Following" />
              {stats.averageScore !== null && (
                <Stat value={stats.averageScore.toFixed(1)} label="Avg score" />
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
                <ShareButton url={`/u/${profile.username}`} title={`${name} on MULO`} />
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

        <Suspense fallback={null}>
          <ProfileSound userId={profile.id} isSelf={followState.isSelf} name={name} />
        </Suspense>

        <Suspense fallback={null}>
          <ProfileBadges userId={profile.id} />
        </Suspense>

        {!followState.isSelf && (
          <Suspense fallback={null}>
            <ProfileTaste userId={profile.id} />
          </Suspense>
        )}

        {followState.isSelf && (
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/goat" variant="secondary" size="sm">
              Your GOAT
            </ButtonLink>
            <ButtonLink href="/ratings" variant="secondary" size="sm">
              My ratings
            </ButtonLink>
            <ButtonLink
              href={`/u/${profile.username}/mixtape`}
              variant="secondary"
              size="sm"
            >
              Your mixtape
            </ButtonLink>
            <ShareButton
              url={`/u/${profile.username}`}
              title={`${name} on MULO`}
              text="My GOAT, my ratings, my mixtape."
              label="Share profile"
            />
            <InviteButton />
          </div>
        )}
      </header>

      <Suspense fallback={null}>
        <ProfileGoat userId={profile.id} name={name} isSelf={followState.isSelf} />
      </Suspense>

      <Suspense fallback={null}>
        <ProfileTopShelf userId={profile.id} isSelf={followState.isSelf} />
      </Suspense>

      <SectionHeading
        action={
          <Link
            href={`/u/${profile.username}/mixtape`}
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            Mixtape →
          </Link>
        }
      >
        Ratings
      </SectionHeading>

      <Suspense fallback={<SkeletonRows count={3} />}>
        <ProfileRatings
          userId={profile.id}
          signedIn={followState.signedIn}
          isSelf={followState.isSelf}
        />
      </Suspense>
    </main>
  );
}

async function ProfileSound({
  userId,
  isSelf,
  name,
}: {
  userId: string;
  isSelf: boolean;
  name: string;
}) {
  const sound = await getSound(userId);
  if (sound.length === 0) return null;

  return (
    <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2" />
      </svg>
      <span className="text-text-muted">{isSelf ? "Your sound" : `${name}'s sound`}</span>
      <span className="text-text">{sound.join(" · ")}</span>
    </p>
  );
}

async function ProfileBadges({ userId }: { userId: string }) {
  const badges = await getBadges(userId);
  if (badges.length === 0) return null;

  return (
    <div className="mt-5">
      <Badges badges={badges} />
    </div>
  );
}

async function ProfileTaste({ userId }: { userId: string }) {
  const taste = await getTasteMatch(userId);
  if (!taste) return null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface/60 px-4 py-3 sm:max-w-md">
      <p className="flex items-baseline gap-2">
        <span className="display text-xl text-accent">{taste.percent}%</span>
        <span className="text-sm text-text-secondary">
          taste match · {taste.shared} in common
        </span>
      </p>
      {taste.clash && (
        <p className="mt-1.5 text-xs text-text-muted">
          You disagree most on{" "}
          <Link
            href={taste.clash.href}
            className="text-text underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            {taste.clash.title}
          </Link>
          {" — you "}
          <span className="font-semibold text-score-you">{taste.clash.yours}</span>
          {", them "}
          <span className="font-semibold text-score-friends">{taste.clash.theirs}</span>
        </p>
      )}
    </div>
  );
}

async function ProfileGoat({
  userId,
  name,
  isSelf,
}: {
  userId: string;
  name: string;
  isSelf: boolean;
}) {
  const [topArtists, topAlbums] = await Promise.all([
    getTopPicks(userId, "artist"),
    getTopPicks(userId, "album"),
  ]);

  if (topArtists.length === 0 && topAlbums.length === 0) {
    return isSelf ? (
      <div className="mb-14">
        <EmptyState
          title="Select your GOAT"
          body="Pick your top ten artists and albums and rank them. Number one wears the crown, on your profile and in the preview when you send someone your link."
          action={<ButtonLink href="/goat">Pick your top ten</ButtonLink>}
        />
      </div>
    ) : null;
  }

  return (
    <section className="mb-14">
      <SectionHeading
        action={
          isSelf ? (
            <Link
              href="/goat"
              className="text-xs text-text-muted transition-colors hover:text-text"
            >
              Edit
            </Link>
          ) : undefined
        }
      >
        {isSelf ? "Your GOAT" : `${name}'s GOAT`}
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
  );
}

async function ProfileTopShelf({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const highest = await getHighestRatedAlbums(userId, 12);
  if (highest.length < 4) return null;

  return (
    <section className="mb-14">
      <SectionHeading
        action={
          isSelf ? (
            <Link
              href="/ratings"
              className="text-xs text-text-muted transition-colors hover:text-text"
            >
              All by score →
            </Link>
          ) : undefined
        }
      >
        Top Shelf
      </SectionHeading>
      <ul className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-6">
        {highest.map((rating, i) => (
          <li key={rating.release.mbid}>
            <AlbumCard
              mbid={rating.release.mbid}
              title={rating.release.title}
              artist={rating.release.artist?.name ?? null}
              coverUrl={rating.release.cover_art_url}
              score={rating.score}
              scoreKind="you"
              eager={i < 6}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ProfileRatings({
  userId,
  signedIn,
  isSelf,
}: {
  userId: string;
  signedIn: boolean;
  isSelf: boolean;
}) {
  const ratings = await getUserFeed(userId);

  if (ratings.length === 0) {
    return (
      <EmptyState
        title="Nothing rated yet"
        body={
          isSelf
            ? "Find an artist, album or song and give it a score out of 10."
            : undefined
        }
        action={
          isSelf ? <ButtonLink href="/search">Search music</ButtonLink> : undefined
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {ratings.map((item) => (
        <FeedItem
          key={item.key}
          item={item}
          showAuthor={false}
          signedIn={signedIn}
          readOnly={isSelf}
        />
      ))}
    </ul>
  );
}
