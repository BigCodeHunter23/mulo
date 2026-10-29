import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { readAll } from "@/lib/supabase/read-all";
import type { Database } from "@/lib/supabase/database.types";
import type { Streak } from "@/lib/app-api";
import { readTimeZone } from "@/lib/push/store";
import { zoneOrSydney } from "@/lib/push/zones";

export type { Streak };

/** Either client: the visitor's, or the service role's for the clock. */
type Reader = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

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
 * Days run on the person's own clock (their time zone, or Sydney's when we
 * don't know it); Daily Versus keeps Sydney's.
 */

/** Far enough back to find any streak worth showing. */
const WINDOW_DAYS = 120;

const formats = new Map<string, Intl.DateTimeFormat>();

/** "2026-09-18", in the given time zone. */
function dayIn(date: Date | string, timeZone: string): string {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formats.set(timeZone, format);
  }
  return format.format(typeof date === "string" ? new Date(date) : date);
}

function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** The streak in a set of moments somebody did something, counted in their zone. */
export function countStreak(stamps: Iterable<string>, timeZone: string, now = new Date()): Streak {
  const active = new Set<string>();
  for (const stamp of stamps) active.add(dayIn(stamp, timeZone));

  const todayKey = dayIn(now, timeZone);
  const today = active.has(todayKey);

  // Count back from today, or from yesterday if today hasn't happened yet:
  // a streak isn't broken until the day is over.
  let days = 0;
  for (
    let day = today ? todayKey : previousDay(todayKey);
    active.has(day);
    day = previousDay(day)
  ) {
    days++;
  }

  let best = 0;
  for (const day of active) {
    if (active.has(previousDay(day))) continue; // not the start of a run
    let length = 0;
    for (let d = day; active.has(d); d = nextDay(d)) length++;
    best = Math.max(best, length);
  }

  return { days, today, best };
}

/** Every table where somebody's doing something leaves a dated row. */
const SOURCES: { table: keyof Database["public"]["Tables"]; columns: string }[] = [
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

/**
 * Somebody's streak. Without a zone it reads theirs; the clock passes it, and
 * its own client, since it runs for many people outside any visit.
 */
export async function getStreak(
  userId: string,
  timeZone?: string | null,
  client?: Reader,
): Promise<Streak> {
  const zone = zoneOrSydney(timeZone === undefined ? await readTimeZone(userId) : timeZone);
  const supabase = client ?? (await createClient());
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const results = await Promise.all(
    SOURCES.map(({ table, columns }) =>
      readAll(
        (from, to) =>
          supabase
            // Typed as one of them: every source has user_id and created_at,
            // which is all this filters on, and the typed query builder can't
            // follow a table chosen at runtime.
            .from(table as "reactions")
            .select(columns)
            .eq("user_id", userId)
            .gte("created_at", since)
            // Not every source has a unique id to page by. Time is close
            // enough: only the day of each row matters here.
            .order("created_at")
            .range(from, to),
        3000,
      ),
    ),
  );

  const stamps: string[] = [];
  for (const { data } of results) {
    // A table that isn't there yet, or refuses the read, just adds nothing.
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      if (row.created_at) stamps.push(row.created_at);
      // An edited score or a review written later is activity on that day too.
      if (row.updated_at) stamps.push(row.updated_at);
    }
  }

  return countStreak(stamps, zone);
}
