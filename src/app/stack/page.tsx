import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getStack } from "@/lib/stack";
import StackDeck from "./StackDeck";
import { ButtonLink, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "The Stack",
  description: "A quick run of records to rate, picked for you.",
};

/** Long enough to be worth opening, short enough to finish. */
const RUN = 40;

export default async function StackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const albums = await getStack(user.id, RUN);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          The Stack
        </p>
        <h1 className="display mt-2 text-3xl text-text sm:text-4xl">
          Rate what you know
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Records picked for you, one at a time. Score the ones you know, wave
          off the ones you don&rsquo;t.
        </p>
      </header>

      {albums.length === 0 ? (
        <EmptyState
          title="Nothing left in the stack"
          body="You've rated everything MULO had lined up for you. Go digging and it'll fill back up."
          action={<ButtonLink href="/discover">Find something new</ButtonLink>}
        />
      ) : (
        <StackDeck albums={albums} />
      )}
    </main>
  );
}
