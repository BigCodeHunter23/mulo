import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { shiftDay, sydneyDay, sydneyMidnight } from "@/lib/versus";
import { DROP_LINEUP, type DropAlbum } from "@/lib/drop-lineup";

/**
 * The Drop: one album a week that everybody rates together.
 *
 * A small community spread across four thousand albums barely overlaps; thirty
 * people on one album is a conversation. Each drop opens at midnight on a
 * Monday, Sydney time, and runs a week. The scores stay hidden until you've
 * given yours, like Daily Versus, so nobody's anchored by the crowd.
 *
 * Nothing new is stored: a drop's scores are ordinary album ratings, so
 * rating it here and rating it on its album page are the same thing.
 */

/** The Monday the first drop opened. Weeks count on from here. */
const DROP_START = "2026-09-14";

export type Drop = {
  /** Counting from one, forever — the lineup loops but the weeks don't. */
  week: number;
  album: DropAlbum;
  opensAt: string;
  closesAt: string;
  /** The moment this was worked out, for the countdown to start from. */
  now: number;
};

export function currentDrop(now = new Date()): Drop {
  const today = sydneyDay(now);
  const days = Math.floor(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${DROP_START}T12:00:00Z`)) / 86_400_000,
  );
  const index = Math.max(0, Math.floor(days / 7));
  const monday = shiftDay(DROP_START, index * 7);

  return {
    week: index + 1,
    album: DROP_LINEUP[index % DROP_LINEUP.length],
    opensAt: sydneyMidnight(monday).toISOString(),
    closesAt: sydneyMidnight(shiftDay(monday, 7)).toISOString(),
    now: now.getTime(),
  };
}

export type DropResults = {
  /** How many people gave each score, 1 to 10. */
  spread: number[];
  count: number;
  /** How many of them rated it during this drop's week. */
  thisWeek: number;
  average: number | null;
  /** The signed-in person's score, if they've given one. */
  yours: number | null;
};

export async function getDropResults(drop: Drop): Promise<DropResults> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data } = await supabase
    .from("ratings")
    .select("user_id, score, created_at")
    .eq("release_mbid", drop.album.mbid)
    .limit(5000);

  const rows = (data ?? []) as { user_id: string; score: number; created_at: string }[];
  const spread = Array.from({ length: 10 }, () => 0);
  for (const row of rows) spread[row.score - 1] += 1;

  return {
    spread,
    count: rows.length,
    thisWeek: rows.filter((row) => row.created_at >= drop.opensAt).length,
    average: rows.length ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : null,
    yours: user ? (rows.find((row) => row.user_id === user.id)?.score ?? null) : null,
  };
}
