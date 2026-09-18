import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Days in a row somebody has done something on MULO.
 *
 * "Something" is deliberately broad: a rating, a review, a love or a nah, a
 * Versus pick or take, a change to their GOAT or their Mixtape. A streak that
 * only counted ratings would punish the days somebody showed up just to argue
 * about a Versus, and those are exactly the days worth rewarding.
 *
 * Like badges, nothing is stored. The streak is read off the timestamps
 * already on every one of those rows, so it can't drift from what happened.
 * Days run on Sydney time, the same clock as Daily Versus.
 */

export type Streak = {
  /** Consecutive days, ending today or yesterday. */
  days: number;
  /** Whether today already counts. If not, the streak ends at midnight. */
  today: boolean;
  /** The longest run in the window looked at. */
  best: number;
};

/** Far enough back to find any streak worth showing. */
const WINDOW_DAYS = 120;

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-09-18", in Sydney. */
function dayOf(date: Date | string): string {
  return DAY.format(typeof date === "string" ? new Date(date) : date);
}

function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Every table where somebody's doing something leaves a dated row. */
const SOURCES: { table: string; columns: string }[] = [
  { table: "ratings", columns: "created_at, updated_at" },
  { table: "artist_ratings", columns: "created_at, updated_at" },
  { table: "song_ratings", columns: "created_at, updated_at" },
  { table: "reactions", columns: "created_at" },
  { table: "versus_votes", columns: "created_at" },
  { table: "versus_takes", columns: "created_at" },
  { table: "top_albums", columns: "created_at" },
  { table: "top_artists", columns: "created_at" },
  { table: "mixtape_picks", columns: "created_at" },
];

export async function getStreak(userId: string): Promise<Streak> {
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const results = await Promise.all(
    SOURCES.map(({ table, columns }) =>
      supabase
        .from(table)
        .select(columns)
        .eq("user_id", userId)
        .gte("created_at", since)
        .limit(3000),
    ),
  );

  const active = new Set<string>();
  for (const { data } of results) {
    // A table that isn't there yet, or refuses the read, just adds nothing.
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      if (row.created_at) active.add(dayOf(row.created_at));
      // An edited score or a review written later is activity on that day too.
      if (row.updated_at) active.add(dayOf(row.updated_at));
    }
  }

  const todayKey = dayOf(new Date());
  const today = active.has(todayKey);

  // Count back from today, or from yesterday if today hasn't happened yet:
  // a streak isn't broken until the day is over.
  let days = 0;
  for (let day = today ? todayKey : previousDay(todayKey); active.has(day); day = previousDay(day)) {
    days++;
  }

  let best = 0;
  for (const day of active) {
    if (active.has(previousDay(day))) continue; // not the start of a run
    let length = 0;
    for (let d = day; active.has(d); ) {
      length++;
      const next = new Date(`${d}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
    best = Math.max(best, length);
  }

  return { days, today, best };
}
