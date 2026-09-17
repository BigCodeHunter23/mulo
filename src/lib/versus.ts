import "server-only";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFollowingIds } from "@/lib/social";
import { VERSUS_PAIRS, VERSUS_START, type VersusPair } from "@/lib/versus-pairs";
import type {
  VersusMatchup,
  VersusPerson,
  VersusResult,
  VersusSideKey,
  VersusTally,
  VersusView,
} from "@/lib/versus-shared";

const SYDNEY = "Australia/Sydney";

/** A day in an address, such as 2026-09-17. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** How long a finished matchup stays in somebody's notifications. */
const RESULT_DAYS = 14;

/** Today's date in Sydney. Each Versus runs from one Sydney midnight to the next. */
export function sydneyDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Sydney's distance from UTC at a moment, in minutes: 600, or 660 in summer. */
function sydneyOffset(at: Date) {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY,
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = zone?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 600;

  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/** The moment a Sydney day begins. */
export function sydneyMidnight(day: string) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  // Guess with standard time, then use the offset in force at that moment,
  // which also gets the days the clocks change right.
  const offset = sydneyOffset(new Date(utc - 600 * 60_000));
  return new Date(utc - offset * 60_000);
}

/** When a day's matchup closes, which is when the next one opens. */
function closesAt(day: string) {
  return sydneyMidnight(shiftDay(day, 1)).toISOString();
}

/** "Thu 17 Sep" */
export function dayLabel(day: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Which pair runs on a day: the lineup in order, starting over at the end. */
export function pairForDay(day: string): VersusPair {
  const days = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${VERSUS_START}T00:00:00Z`)) /
      86_400_000,
  );
  const count = VERSUS_PAIRS.length;
  return VERSUS_PAIRS[((days % count) + count) % count];
}

function lineupPair(left: string, right: string) {
  return VERSUS_PAIRS.find((pair) => pair.left === left && pair.right === right);
}

type ArtistRow = { mbid: string; name: string; image_url: string | null };
export type MatchupRow = { id: number; day: string; left: ArtistRow; right: ArtistRow };

// A matchup points at two artists, so each join names the link it follows.
export const MATCHUP_SELECT =
  "id, day, left:artists!versus_matchups_left_artist_mbid_fkey ( mbid, name, image_url ), right:artists!versus_matchups_right_artist_mbid_fkey ( mbid, name, image_url )";

export function toMatchup(row: MatchupRow): VersusMatchup {
  const pair = lineupPair(row.left.mbid, row.right.mbid);
  const side = (artist: ArtistRow, name?: string) => ({
    mbid: artist.mbid,
    name: name ?? artist.name,
    image: artist.image_url,
  });

  const left = side(row.left, pair?.leftName);
  const right = side(row.right, pair?.rightName);

  return {
    id: row.id,
    day: row.day,
    title: pair?.title ?? `${left.name} vs ${right.name}`,
    tagline: pair?.tagline ?? "",
    left,
    right,
  };
}

async function fetchMatchup(day: string): Promise<VersusMatchup | null> {
  const { data } = await createPublicClient()
    .from("versus_matchups")
    .select(MATCHUP_SELECT)
    .eq("day", day)
    .maybeSingle();

  return data ? toMatchup(data as unknown as MatchupRow) : null;
}

/** The matchup that ran on a day, if there was one. */
export const getMatchupForDay = cache(fetchMatchup);

/**
 * Today's matchup. The first visit of the day sets it up from the lineup, so
 * nothing has to run on a timer. Each day can only have one, so two visits at
 * the same moment still agree.
 */
export const getTodaysMatchup = cache(async (): Promise<VersusMatchup | null> => {
  const day = sydneyDay();
  const existing = await fetchMatchup(day);
  if (existing) return existing;

  const pair = pairForDay(day);
  await createAdminClient()
    .from("versus_matchups")
    .upsert(
      { day, left_artist_mbid: pair.left, right_artist_mbid: pair.right },
      { onConflict: "day", ignoreDuplicates: true },
    );

  return fetchMatchup(day);
});

/** How many picked each side. */
export async function countPicks(matchupId: number) {
  const supabase = createPublicClient();
  const count = (pick: VersusSideKey) =>
    supabase
      .from("versus_votes")
      .select("matchup_id", { count: "exact", head: true })
      .eq("matchup_id", matchupId)
      .eq("pick", pick);

  const [left, right] = await Promise.all([count("left"), count("right")]);
  return { left: left.count ?? 0, right: right.count ?? 0 };
}

type FriendPick = { matchup_id: number; pick: VersusSideKey; profiles: VersusPerson };

/** Picks made by the people somebody follows, across one or more matchups. */
async function friendPicks(
  matchupIds: number[],
  followingIds: string[],
): Promise<FriendPick[]> {
  if (matchupIds.length === 0 || followingIds.length === 0) return [];

  const { data } = await createPublicClient()
    .from("versus_votes")
    .select("matchup_id, pick, profiles!inner ( username, display_name, avatar_url )")
    .in("matchup_id", matchupIds)
    .in("user_id", followingIds)
    .order("created_at", { ascending: true })
    .limit(1000);

  return (data ?? []) as unknown as FriendPick[];
}

function bySide(picks: FriendPick[], matchupId: number): VersusTally["friends"] {
  const friends: VersusTally["friends"] = { left: [], right: [] };
  for (const pick of picks) {
    if (pick.matchup_id === matchupId) friends[pick.pick].push(pick.profiles);
  }
  return friends;
}

/** Somebody's pick in a matchup, if they made one. */
export async function getPick(
  matchupId: number,
  userId: string,
): Promise<VersusSideKey | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("versus_votes")
    .select("pick")
    .eq("matchup_id", matchupId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data?.pick as VersusSideKey | undefined) ?? null;
}

/** The split, and how the people somebody follows went. */
export async function getTally(
  matchupId: number,
  userId: string | null,
): Promise<VersusTally> {
  const [counts, followingIds] = await Promise.all([
    countPicks(matchupId),
    userId ? getFollowingIds(userId) : Promise.resolve<string[]>([]),
  ]);
  const picks = await friendPicks([matchupId], followingIds);

  return { ...counts, friends: bySide(picks, matchupId) };
}

/** A matchup as the person looking at it should see it. */
export async function getVersusView(matchup: VersusMatchup): Promise<VersusView> {
  const user = await getCurrentUser();

  const [followingIds, mine, counts] = await Promise.all([
    user ? getFollowingIds(user.id) : Promise.resolve<string[]>([]),
    user ? getPick(matchup.id, user.id) : Promise.resolve(null),
    countPicks(matchup.id),
  ]);
  const picks = await friendPicks([matchup.id], followingIds);
  const closed = matchup.day < sydneyDay();

  return {
    matchup,
    closed,
    closesAt: closesAt(matchup.day),
    now: Date.now(),
    signedIn: user !== null,
    mine,
    // Nobody sees the split before picking, so it can't sway them.
    tally: closed || mine ? { ...counts, friends: bySide(picks, matchup.id) } : null,
    friendsPicked: picks.length,
  };
}

/** Whether somebody has picked in today's matchup yet. */
export async function hasPickedToday(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("versus_votes")
    .select("matchup_id, versus_matchups!inner ( day )")
    .eq("user_id", userId)
    .eq("versus_matchups.day", sydneyDay())
    .limit(1);

  return (data ?? []).length > 0;
}

/** The finished matchups somebody picked in lately, newest first, with how they went. */
export async function getRecentResults(
  userId: string,
  limit = 5,
): Promise<VersusResult[]> {
  const supabase = await createClient();
  const today = sydneyDay();

  const { data } = await supabase
    .from("versus_votes")
    .select(`pick, versus_matchups!inner ( ${MATCHUP_SELECT} )`)
    .eq("user_id", userId)
    .lt("versus_matchups.day", today)
    .gte("versus_matchups.day", shiftDay(today, -RESULT_DAYS))
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as {
    pick: VersusSideKey;
    versus_matchups: MatchupRow;
  }[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.versus_matchups.id);
  const [counts, picks] = await Promise.all([
    Promise.all(ids.map(countPicks)),
    getFollowingIds(userId).then((following) => friendPicks(ids, following)),
  ]);

  return rows.map((row, i) => {
    const matchup = toMatchup(row.versus_matchups);
    return {
      matchup,
      mine: row.pick,
      tally: { ...counts[i], friends: bySide(picks, matchup.id) },
      at: closesAt(matchup.day),
    };
  });
}

/**
 * When Versus last had something to tell somebody, for the dot on the bell:
 * today's matchup opening, if they haven't picked, or otherwise the latest
 * result they were waiting on.
 */
export async function getLatestVersusAt(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const today = sydneyDay();

  const [picked, latest] = await Promise.all([
    hasPickedToday(userId),
    supabase
      .from("versus_votes")
      .select("created_at, versus_matchups!inner ( day )")
      .eq("user_id", userId)
      .lt("versus_matchups.day", today)
      .gte("versus_matchups.day", shiftDay(today, -RESULT_DAYS))
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Nothing can be newer than this morning's matchup opening.
  if (!picked) return sydneyMidnight(today).toISOString();

  const row = latest.data?.[0] as unknown as { versus_matchups: { day: string } } | undefined;
  return row ? closesAt(row.versus_matchups.day) : null;
}
