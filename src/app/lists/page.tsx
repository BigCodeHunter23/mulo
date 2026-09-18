import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/server";
import { getRecentLists, getUserLists } from "@/lib/lists";
import ListCard from "@/components/ListCard";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Lists",
  description: "Lists of albums made by people on MULO.",
};

export default async function ListsPage() {
  const user = await getCurrentUser();
  const [mine, recent] = await Promise.all([
    user ? getUserLists(user.id) : Promise.resolve([]),
    getRecentLists(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl text-text">Lists</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Best debuts, Sunday mornings, the albums that raised you: put them in order and share them.
          </p>
        </div>
        <ButtonLink href={user ? "/lists/new" : "/login"}>New list</ButtonLink>
      </header>

      {user && (
        <section className="mb-12">
          <SectionHeading>Your lists</SectionHeading>
          {mine.length === 0 ? (
            <EmptyState
              title="No lists yet"
              body="Start one here, or from the Add to list button on any album."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((list) => (
                <li key={list.id}>
                  <ListCard list={list} showOwner={false} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <SectionHeading>Recent lists</SectionHeading>
        {recent.length === 0 ? (
          <p className="text-sm text-text-secondary">Nobody has made a list yet. Be the first.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((list) => (
              <li key={list.id}>
                <ListCard list={list} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
