import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DAY_PATTERN, getMatchupForDay, getTodaysMatchup, sydneyDay } from "@/lib/versus";
import VersusScreen, { versusMetadata } from "../VersusScreen";

/** Today's matchup, or a past one; there's nothing to see ahead of time. */
async function matchupFor(day: string) {
  if (!DAY_PATTERN.test(day)) return null;

  const today = sydneyDay();
  if (day > today) return null;
  return day === today ? getTodaysMatchup() : getMatchupForDay(day);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ day: string }>;
}): Promise<Metadata> {
  const matchup = await matchupFor((await params).day);
  return matchup ? versusMetadata(matchup) : { title: "Daily Versus" };
}

export default async function VersusDayPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const matchup = await matchupFor((await params).day);
  if (!matchup) notFound();

  return <VersusScreen matchup={matchup} />;
}
