import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/server";
import { getFollowingIds, listProfiles } from "@/lib/social";
import InviteButton from "@/components/InviteButton";
import PersonRow from "@/components/PersonRow";
import { EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await getCurrentUser();

  const [profiles, followingIds] = await Promise.all([
    listProfiles(),
    user ? getFollowingIds(user.id) : Promise.resolve<string[]>([]),
  ]);

  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading action={user ? <InviteButton /> : undefined}>
        People on MULO
      </SectionHeading>

      {profiles.length === 0 ? (
        <EmptyState title="Nobody has set up a profile yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <PersonRow
              key={profile.id}
              profile={profile}
              signedIn={Boolean(user)}
              isSelf={user?.id === profile.id}
              isFollowing={following.has(profile.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
