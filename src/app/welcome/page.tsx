import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { mostPlayedAlbums, popularArtists } from "@/lib/discover";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { getFollowingIds, listProfiles } from "@/lib/social";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";
import { ButtonLink, EmptyState } from "@/components/ui";
import WelcomeProfileForm from "./WelcomeProfileForm";
import QuickRateGrid from "./QuickRateGrid";

export const metadata: Metadata = { title: "Welcome" };

const STEPS = ["profile", "rate", "follow"] as const;
type Step = (typeof STEPS)[number];

const LABELS: Record<Step, string> = {
  profile: "Your profile",
  rate: "Rate music",
  follow: "Follow people",
};

/**
 * First run for a new account: pick a username, rate a handful of artists
 * and albums you know, follow some people. A minute in, the feed and the scores around
 * MULO have something in them.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const { step: requested } = await searchParams;
  // Ratings and follows hang off a profile, so a username always comes first.
  const step: Step = !profile
    ? "profile"
    : requested === "follow"
      ? "follow"
      : "rate";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-10 sm:px-6">
      <Progress step={step} />
      {step === "profile" && <ProfileStep />}
      {step === "rate" && <RateStep userId={user.id} />}
      {step === "follow" && <FollowStep userId={user.id} />}
    </main>
  );
}

function Progress({ step }: { step: Step }) {
  const current = STEPS.indexOf(step);

  return (
    <ol className="mb-10 flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              i < current
                ? "bg-accent text-[#0b0b0e]"
                : i === current
                  ? "border border-accent text-accent"
                  : "border border-border text-text-muted"
            }`}
          >
            {i < current ? "✓" : i + 1}
          </span>
          <span className={i === current ? "text-text" : "text-text-muted"}>
            {LABELS[s]}
          </span>
          {i < STEPS.length - 1 && (
            <span aria-hidden="true" className="mx-1 h-px w-6 bg-border sm:w-10" />
          )}
        </li>
      ))}
    </ol>
  );
}

function ProfileStep() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="display text-3xl text-text">Welcome to MULO</h1>
      <p className="mt-2 text-sm text-text-secondary">
        First, pick a username so people can find and follow you. You can add a
        photo and a bio later.
      </p>
      <div className="mt-7">
        <WelcomeProfileForm />
      </div>
    </div>
  );
}

async function RateStep({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [artists, albums, { data: ratedArtists }, { data: ratedAlbums }] =
    await Promise.all([
      popularArtists(20),
      mostPlayedAlbums(30),
      supabase.from("artist_ratings").select("artist_mbid, score").eq("user_id", userId),
      supabase.from("ratings").select("release_mbid, score").eq("user_id", userId),
    ]);

  const scores: Record<string, number> = {};
  for (const r of ratedArtists ?? []) scores[`artist:${r.artist_mbid}`] = r.score;
  for (const r of ratedAlbums ?? []) scores[`album:${r.release_mbid}`] = r.score;

  return (
    <div>
      <h1 className="display text-3xl text-text">Rate some music you know</h1>
      <p className="mt-2 max-w-xl text-sm text-text-secondary">
        Tap an artist or an album, then a score out of 10. Skip anything you
        don&rsquo;t know; five or so is plenty to start.
      </p>
      <div className="mt-8">
        <QuickRateGrid
          artists={artists.map((a) => ({
            mbid: a.mbid,
            title: a.name,
            subtitle: null,
            image: artistPhotoSrc(a.image_url, 300),
          }))}
          albums={albums.map((a) => ({
            mbid: a.mbid,
            title: a.title,
            subtitle: a.artist,
            image: coverSrc(a.cover_art_url, 250),
          }))}
          initialScores={scores}
        />
      </div>
    </div>
  );
}

async function FollowStep({ userId }: { userId: string }) {
  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    getFollowingIds(userId),
  ]);

  const following = new Set(followingIds);
  const others = profiles.filter((p) => p.id !== userId);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-3xl text-text">Follow some people</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Their ratings fill your feed, and they make up the blue
        &ldquo;Friends&rdquo; score on every album and artist.
      </p>

      {others.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="You're one of the first here"
            body="Invite some friends, then follow them from the People page."
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {others.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5"
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
                <p className="truncate text-sm text-text-muted">
                  @{profile.username}
                </p>
              </div>
              <FollowButton
                targetId={profile.id}
                username={profile.username}
                signedIn
                isSelf={false}
                isFollowing={following.has(profile.id)}
                size="small"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex justify-end">
        <ButtonLink href="/">Go to my feed</ButtonLink>
      </div>
    </div>
  );
}
