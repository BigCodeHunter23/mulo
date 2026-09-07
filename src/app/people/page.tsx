import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { getFollowingIds, listProfiles } from "@/lib/social";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";
import { EmptyState, SectionHeading } from "@/components/ui";

export default async function PeoplePage() {
  const user = await getCurrentUser();

  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    user ? getFollowingIds(user.id) : Promise.resolve([]),
  ]);

  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading>People on MULO</SectionHeading>

      {profiles.length === 0 ? (
        <EmptyState title="Nobody has set up a profile yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
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
                {profile.bio && (
                  <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
                    {profile.bio}
                  </p>
                )}
              </div>

              <FollowButton
                targetId={profile.id}
                username={profile.username}
                signedIn={Boolean(user)}
                isSelf={user?.id === profile.id}
                isFollowing={following.has(profile.id)}
                size="small"
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
