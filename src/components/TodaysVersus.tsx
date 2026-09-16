import Link from "next/link";
import { getTodaysMatchup, getVersusView } from "@/lib/versus";
import VersusCard from "@/components/VersusCard";
import { SectionHeading } from "@/components/ui";

function Bolt() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-accent"
      fill="currentColor"
    >
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function Heading() {
  return (
    <SectionHeading
      action={
        <Link
          href="/versus"
          className="text-xs text-text-muted transition-colors hover:text-text"
        >
          More →
        </Link>
      }
    >
      <span className="flex items-center gap-2">
        <Bolt />
        Daily Versus
      </span>
    </SectionHeading>
  );
}

/** Holds the space while today's matchup loads, so the page doesn't jump. */
export function TodaysVersusPlaceholder({ className = "" }: { className?: string }) {
  return (
    <section className={className}>
      <Heading />
      <div className="h-60 animate-pulse rounded-2xl border border-border bg-surface sm:h-64" />
    </section>
  );
}

/** Today's matchup, pickable right there, for the top of the feed and Discover. */
export default async function TodaysVersus({ className = "" }: { className?: string }) {
  const matchup = await getTodaysMatchup();
  if (!matchup) return null;

  const view = await getVersusView(matchup);

  return (
    <section className={className}>
      <Heading />
      <VersusCard view={view} compact />
    </section>
  );
}
