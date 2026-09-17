import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getFollowingFeed } from "@/lib/feed";
import { getHeavyRotation } from "@/lib/trending";
import { isRecordAvatar, RAISED_ON_PROMPT_COOKIE } from "@/lib/record-avatar";
import FeedItem from "@/components/FeedItem";
import HeavyRotation from "@/components/HeavyRotation";
import TodaysVersus, { TodaysVersusPlaceholder } from "@/components/TodaysVersus";
import DiscoverSections from "@/components/DiscoverSections";
import RaisedOnPrompt from "@/components/RaisedOnPrompt";
import CoverWall from "@/components/CoverWall";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

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
      .select("id, avatar_url, raised_on_mbid")
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
        <DiscoverSections />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      {prompt}
      {/* These stream in on their own, so the feed never waits for them. */}
      <Suspense fallback={<TodaysVersusPlaceholder className="mb-10" />}>
        <TodaysVersus className="mb-10" />
      </Suspense>
      <Suspense fallback={null}>
        <HomeRotation />
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
      <ul className="flex flex-col gap-3">
        {feed.map((item) => (
          <FeedItem key={item.key} item={item} signedIn />
        ))}
      </ul>
    </main>
  );
}

async function HomeRotation() {
  const rotation = await getHeavyRotation(8);
  return rotation ? <HeavyRotation rotation={rotation} compact /> : null;
}
