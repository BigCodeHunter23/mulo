import type { Metadata } from "next";
import { getTodaysMatchup } from "@/lib/versus";
import { EmptyState } from "@/components/ui";
import VersusScreen, { versusMetadata } from "./VersusScreen";

export async function generateMetadata(): Promise<Metadata> {
  const matchup = await getTodaysMatchup();
  return matchup ? versusMetadata(matchup) : { title: "Daily Versus" };
}

export default async function VersusPage() {
  const matchup = await getTodaysMatchup();

  if (!matchup) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        <EmptyState
          title="No Versus right now"
          body="Today's matchup couldn't be set up. Try again in a minute."
        />
      </main>
    );
  }

  return <VersusScreen matchup={matchup} />;
}
