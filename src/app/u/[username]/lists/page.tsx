import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfileByUsername } from "@/lib/social";
import { getUserLists } from "@/lib/lists";
import ListCard from "@/components/ListCard";
import { EmptyState } from "@/components/ui";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const profile = await getProfileByUsername((await params).username);
  return { title: profile ? `${profile.display_name || profile.username}'s lists` : "Lists" };
}

export default async function UserListsPage({ params }: { params: Params }) {
  const profile = await getProfileByUsername((await params).username);
  if (!profile) notFound();
  const name = profile.display_name || profile.username;
  const lists = (await getUserLists(profile.id)).filter((list) => list.count > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <h1 className="display mb-8 text-4xl text-text">{name}&rsquo;s lists</h1>
      {lists.length === 0 ? (
        <EmptyState title="No lists yet" body={`${name} hasn't made a list yet.`} />
      ) : (
        <ul className="flex flex-col gap-2">
          {lists.map((list) => (
            <li key={list.id}>
              <ListCard list={list} showOwner={false} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
