import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getFollowingIds, listProfiles } from "@/lib/social";
import InviteButton from "@/components/InviteButton";
import PersonRow from "@/components/PersonRow";
import { EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "People" };

/**
 * Everyone on MULO, to find people to follow. A directory of members is for
 * members: profiles themselves stay public so shared links keep working, but
 * the list of everyone needs an account.
 */
export default async function PeoplePage() {
  const user = await requireUser("/people");

  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    getFollowingIds(user.id),
  ]);

  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading action={<InviteButton />}>People on MULO</SectionHeading>

      {profiles.length === 0 ? (
        <EmptyState title="Nobody has set up a profile yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <PersonRow
              key={profile.id}
              profile={profile}
              signedIn
              isSelf={user.id === profile.id}
              isFollowing={following.has(profile.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
