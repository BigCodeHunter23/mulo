import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getFollowingIds, getProfileByUsername, listFollows } from "@/lib/social";
import PersonRow from "@/components/PersonRow";
import { EmptyState } from "@/components/ui";

type Direction = "followers" | "following";

function directionOf(value: string | undefined): Direction {
  return value === "following" ? "following" : "followers";
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ show?: string }>;
}): Promise<Metadata> {
  const [{ username }, { show }] = await Promise.all([params, searchParams]);
  const direction = directionOf(show);

  return {
    title:
      direction === "following"
        ? `Who ${username} follows`
        : `${username}'s followers`,
  };
}

const TAB =
  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors";
const ON = "border-accent bg-accent-subtle text-accent";
const OFF =
  "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text";

/**
 * Who follows somebody and who they follow, as one page with two tabs. A
 * count on a profile is a dead end; this is the page it should have led to
 * all along.
 */
export default async function FollowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const [{ username }, { show }] = await Promise.all([params, searchParams]);
  const direction = directionOf(show);

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const viewer = await getCurrentUser();
  const [people, followingIds] = await Promise.all([
    listFollows(profile.id, direction),
    viewer ? getFollowingIds(viewer.id) : Promise.resolve<string[]>([]),
  ]);

  const following = new Set(followingIds);
  const name = profile.display_name || profile.username;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-sm text-text-muted transition-colors hover:text-text"
      >
        &lsaquo; {name}
      </Link>

      <h1 className="display mt-3 text-3xl text-text sm:text-4xl">
        {direction === "following" ? `Who ${name} follows` : "Followers"}
      </h1>

      <nav className="mt-5 flex gap-2" aria-label="Which list">
        <Link
          href={`/u/${profile.username}/follows?show=followers`}
          aria-current={direction === "followers" ? "page" : undefined}
          className={`${TAB} ${direction === "followers" ? ON : OFF}`}
        >
          Followers
        </Link>
        <Link
          href={`/u/${profile.username}/follows?show=following`}
          aria-current={direction === "following" ? "page" : undefined}
          className={`${TAB} ${direction === "following" ? ON : OFF}`}
        >
          Following
        </Link>
      </nav>

      <div className="mt-7">
        {people.length === 0 ? (
          <EmptyState
            title={
              direction === "following"
                ? `${name} isn't following anyone yet.`
                : `Nobody follows ${name} yet.`
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                profile={person}
                signedIn={Boolean(viewer)}
                isSelf={viewer?.id === person.id}
                isFollowing={following.has(person.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
