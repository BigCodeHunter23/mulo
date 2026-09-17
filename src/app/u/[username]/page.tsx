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
import { getRaisedOn, type RaisedOn } from "@/lib/raised-on";
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
import { buttonClass, ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

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

function RecordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** "Raised on Illmatic · Golden-era hip hop", or a nudge on your own profile. */
function RaisedOnLine({ raisedOn, isSelf }: { raisedOn: RaisedOn | null; isSelf: boolean }) {
  if (!raisedOn) {
    return isSelf ? (
      <Link
        href="/profile/raised-on"
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-accent"
      >
        <RecordIcon />
        What were you raised on?
      </Link>
    ) : null;
  }

  const place = raisedOn.scene?.name ?? raisedOn.era?.label;

  return (
    <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
      <RecordIcon />
      <span className="truncate">
        Raised on{" "}
        <Link
          href={`/album/${raisedOn.album.mbid}`}
          className="font-medium text-text transition-colors hover:text-accent"
        >
          {raisedOn.album.title}
        </Link>
        {place && <span className="text-text-muted">{` · ${place}`}</span>}
      </span>
      {isSelf && (
        <Link
          href="/profile/raised-on"
          className="shrink-0 text-text-muted transition-colors hover:text-text"
        >
          Change
        </Link>
      )}
    </p>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center sm:items-start">
      <span className="display-sm text-lg tabular-nums text-text sm:text-xl">{value}</span>
      <span className="text-[11px] text-text-muted sm:text-xs sm:font-medium sm:uppercase sm:tracking-wider">
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

  const [stats, followState, raisedOn] = await Promise.all([
    getProfileStats(profile.id),
    getFollowState(profile.id),
    getRaisedOn(profile.id),
  ]);

  const name = profile.display_name || profile.username;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-10">
        {/* Phones: picture and numbers side by side, then the name, then the
            buttons across the full width. Wider screens: the name and numbers
            stack beside the picture, with the buttons to the right. */}
        <div className="profile-head grid items-center gap-x-5 gap-y-4 sm:items-start sm:gap-x-6">
          <div className="[grid-area:avatar]">
            <Avatar url={profile.avatar_url} name={name} size="profile" eager />
          </div>

          <div className="min-w-0 [grid-area:name]">
            <h1 className="display truncate text-2xl text-text sm:text-4xl">{name}</h1>
            <p className="text-sm text-text-muted">@{profile.username}</p>
            <RaisedOnLine raisedOn={raisedOn} isSelf={followState.isSelf} />
          </div>

          <div className="grid grid-cols-4 gap-1 [grid-area:stats] sm:flex sm:gap-7">
            <Stat value={stats.ratings} label="Rated" />
            <Stat value={stats.followers} label="Followers" />
            <Stat value={stats.following} label="Following" />
            <Stat
              value={stats.averageScore !== null ? stats.averageScore.toFixed(1) : "–"}
              label="Avg"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 [grid-area:actions] sm:flex-col sm:flex-nowrap sm:items-end">
            {followState.isSelf ? (
              <>
                <div className="flex-1 sm:flex-none">
                  <Link
                    href="/profile"
                    className={`${buttonClass({ variant: "secondary" })} w-full sm:w-auto`}
                  >
                    Edit profile
                  </Link>
                </div>
                <ShareButton
                  url={`/u/${profile.username}`}
                  title={`${name} on MULO`}
                  text="My GOAT, my ratings, my mixtape."
                  label="Share"
                />
              </>
            ) : (
              <>
                <div className="flex-1 sm:flex-none">
                  <FollowButton
                    targetId={profile.id}
                    username={profile.username}
                    signedIn={followState.signedIn}
                    isSelf={followState.isSelf}
                    isFollowing={followState.isFollowing}
                    block
                  />
                </div>
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
          <ProfileBadges userId={profile.id} username={profile.username} />
        </Suspense>

        {!followState.isSelf && (
          <Suspense fallback={null}>
            <ProfileTaste userId={profile.id} />
          </Suspense>
        )}

        {/* Shortcuts: one swipeable row on phones rather than a wrapped pile. */}
        {followState.isSelf && (
          <div className="rail -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [&>*]:shrink-0">
            <ButtonLink href="/goat" variant="secondary" size="sm">
              Your GOAT
            </ButtonLink>
            <ButtonLink
              href={`/u/${profile.username}/badges`}
              variant="secondary"
              size="sm"
            >
              Your badges
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

async function ProfileBadges({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const badges = await getBadges(userId);

  return (
    <div className="mt-5">
      <Badges badges={badges} href={`/u/${username}/badges`} />
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
