import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFollowingIds, listProfiles } from "@/lib/social";
import FollowButton from "@/components/FollowButton";
import SectionHeading from "@/components/SectionHeading";

export default async function PeoplePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    user ? getFollowingIds(user.id) : Promise.resolve([]),
  ]);

  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SectionHeading>People on MULO</SectionHeading>
      <p className="mb-6 text-sm text-mulo-muted">
        Follow someone to see their ratings in your feed.
      </p>

      {profiles.length === 0 ? (
        <p className="text-gray-600">Nobody has set up a profile yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/u/${profile.username}`}
                  className="font-medium hover:underline"
                >
                  {profile.display_name || profile.username}
                </Link>
                <p className="text-sm text-gray-500">@{profile.username}</p>
                {profile.bio && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">
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
