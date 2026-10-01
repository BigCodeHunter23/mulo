import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getFollowingIds, listProfiles } from "@/lib/social";
import InviteButton from "@/components/InviteButton";
import PersonRow from "@/components/PersonRow";
import { ButtonLink, EmptyState, Pager, SectionHeading } from "@/components/ui";
import { pageNumber } from "@/lib/validation";

const PAGE_SIZE = 50;

export const metadata: Metadata = { title: "People" };

/**
 * Everyone on MULO, to find people to follow. A directory of members is for
 * members: profiles themselves stay public so shared links keep working, but
 * the list of everyone needs an account.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const user = await requireUser(page > 1 ? `/people?page=${page}` : "/people");

  const [found, followingIds] = await Promise.all([
    listProfiles({ offset: (page - 1) * PAGE_SIZE, size: PAGE_SIZE + 1 }),
    getFollowingIds(user.id),
  ]);

  const profiles = found.slice(0, PAGE_SIZE);
  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading action={<InviteButton />}>People on MULO</SectionHeading>

      {profiles.length === 0 ? (
        page > 1 ? (
          <EmptyState
            title="That's everyone."
            action={<ButtonLink href="/people">Back to the first page</ButtonLink>}
          />
        ) : (
          <EmptyState title="Nobody has set up a profile yet." />
        )
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

      <Pager page={page} hasMore={found.length > PAGE_SIZE} path="/people" />
    </main>
  );
}
