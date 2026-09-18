import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getFollowingFeed, getGlobalFeed, type FeedItem as Item } from "@/lib/feed";
import { getFollowingIds, listProfiles } from "@/lib/social";
import { getHeavyRotation } from "@/lib/trending";
import { isRecordAvatar, RAISED_ON_PROMPT_COOKIE } from "@/lib/record-avatar";
import Avatar from "@/components/Avatar";
import FeedItem from "@/components/FeedItem";
import FollowButton from "@/components/FollowButton";
import HeavyRotation from "@/components/HeavyRotation";
import TodaysVersus, { TodaysVersusPlaceholder } from "@/components/TodaysVersus";
import DiscoverSections, { NewReleases } from "@/components/DiscoverSections";
import RaisedOnPrompt from "@/components/RaisedOnPrompt";
import CoverWall from "@/components/CoverWall";
import TasteTwin from "@/components/TasteTwin";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

/** How much of the feed to show before the first break, and between breaks. */
const OPENING = 6;
const MIDDLE = 8;

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            For music lovers
          </p>
          <h1 className="display mt-4 text-balance text-[2.75rem] leading-[1.02] text-text sm:text-6xl">
            Every record,{" "}
            <span className="text-accent">rated by people you trust.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-text-secondary">
            Rate the albums, artists and songs you love, crown your GOAT, and
            settle the debate with your friends.
          </p>
          <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <ButtonLink href="/login?mode=signup">Join MULO, it&rsquo;s free</ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Log in
            </ButtonLink>
          </div>
        </section>

        <Suspense fallback={<div className="h-56 sm:h-72" />}>
          <div className="mb-16 mt-12">
            <CoverWall />
          </div>
        </Suspense>

        <DiscoverSections />
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: profile }, feed, store] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, raised_on_mbid")
      .eq("id", user.id)
      .maybeSingle(),
    getFollowingFeed(user.id),
    cookies(),
  ]);

  // A new account hasn't picked a username yet, so nothing else would work.
  if (!profile) redirect("/welcome");

  // Accounts from before Raised On get asked once, until they pick or hide it.
  const prompt =
    !profile.raised_on_mbid && store.get(RAISED_ON_PROMPT_COOKIE)?.value !== "hidden" ? (
      <RaisedOnPrompt hasPhoto={!isRecordAvatar(profile.avatar_url)} />
    ) : null;

  if (feed.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        {prompt}
        <div className="mb-14">
          <SectionHeading>Your feed</SectionHeading>
          <EmptyState
            title="Your feed fills up as you follow people"
            body="Their ratings and reviews show up here, newest first."
            action={<ButtonLink href="/people">Find people to follow</ButtonLink>}
          />
        </div>
        <Suspense fallback={null}>
          <div className="mb-14 empty:hidden">
            <TasteTwin userId={user.id} />
          </div>
        </Suspense>
        <DiscoverSections />
      </main>
    );
  }

  // Friends first, then something to look at, then more friends. A wall of one
  // thing gets scrolled past; breaking it up is what keeps people going down.
  const opening = feed.slice(0, OPENING);
  const middle = feed.slice(OPENING, OPENING + MIDDLE);
  const rest = feed.slice(OPENING + MIDDLE);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      {prompt}
      {/* These stream in on their own, so the feed never waits for them. */}
      <Suspense fallback={<TodaysVersusPlaceholder className="mb-10" />}>
        <TodaysVersus className="mb-10" />
      </Suspense>

      <SectionHeading
        action={
          <Link
            href="/discover"
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            Discover more →
          </Link>
        }
      >
        Your feed
      </SectionHeading>
      <Feed items={opening} />

      <Suspense fallback={null}>
        <div className="mt-12 empty:hidden">
          <HomeRotation />
        </div>
      </Suspense>

      {middle.length > 0 && (
        <div className="mt-12 empty:hidden">
          <Feed items={middle} />
        </div>
      )}

      <Suspense fallback={null}>
        <div className="mt-12 empty:hidden">
          <TasteTwin userId={user.id} />
        </div>
      </Suspense>

      <Suspense fallback={null}>
        <div className="mt-12 empty:hidden">
          <NewReleases />
        </div>
      </Suspense>

      {rest.length > 0 && (
        <div className="mt-12 empty:hidden">
          <Feed items={rest} />
        </div>
      )}

      <Suspense fallback={null}>
        <div className="mt-12 empty:hidden">
          <PeopleToFollow userId={user.id} />
        </div>
      </Suspense>

      <Suspense fallback={null}>
        <div className="mt-12 empty:hidden">
          <AroundMulo seen={feed.map((item) => item.key)} me={profile.username} />
        </div>
      </Suspense>
    </main>
  );
}

function Feed({ items }: { items: Item[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <FeedItem key={item.key} item={item} signedIn />
      ))}
    </ul>
  );
}

async function HomeRotation() {
  const rotation = await getHeavyRotation(8);
  return rotation ? <HeavyRotation rotation={rotation} compact /> : null;
}

/** Nobody to follow yet is the normal state early on, so this just hides. */
async function PeopleToFollow({ userId }: { userId: string }) {
  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    getFollowingIds(userId),
  ]);

  const following = new Set([...followingIds, userId]);
  const suggestions = profiles.filter((p) => !following.has(p.id)).slice(0, 4);
  if (suggestions.length === 0) return null;

  return (
    <section>
      <SectionHeading
        action={
          <Link
            href="/people"
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            Everyone →
          </Link>
        }
      >
        People to follow
      </SectionHeading>
      <ul className="flex flex-col gap-2">
        {suggestions.map((profile) => (
          <li
            key={profile.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong"
          >
            <Link href={`/u/${profile.username}`}>
              <Avatar
                url={profile.avatar_url}
                name={profile.display_name || profile.username}
                size="md"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/u/${profile.username}`}
                className="block truncate font-medium text-text transition-colors hover:text-accent"
              >
                {profile.display_name || profile.username}
              </Link>
              <p className="truncate text-sm text-text-muted">@{profile.username}</p>
            </div>
            <FollowButton
              targetId={profile.id}
              username={profile.username}
              signedIn
              isSelf={false}
              isFollowing={false}
              size="small"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The bottom of the feed used to be the end of the page. This is what everyone
 * else has been rating, minus anything already shown above.
 */
async function AroundMulo({ seen, me }: { seen: string[]; me: string }) {
  const recent = await getGlobalFeed(24);
  const already = new Set(seen);
  const others = recent
    .filter((item) => !already.has(item.key) && item.author.username !== me)
    .slice(0, 4);

  if (others.length === 0) return null;

  return (
    <section>
      <SectionHeading
        action={
          <Link
            href="/discover"
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            More →
          </Link>
        }
      >
        Around MULO
      </SectionHeading>
      <Feed items={others} />
    </section>
  );
}
