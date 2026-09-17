import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getLatestVersusAt,
  getRecentResults,
  getTodaysMatchup,
  hasPickedToday,
  MATCHUP_SELECT,
  sydneyMidnight,
  toMatchup,
  type MatchupRow,
} from "@/lib/versus";
import type { VersusMatchup, VersusResult, VersusSideKey } from "@/lib/versus-shared";

/** When somebody last opened their notifications, kept per browser. */
export const SEEN_COOKIE = "mulo_notifications_seen";

export type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Notification =
  | { kind: "follow"; key: string; at: string; person: Person }
  | {
      kind: "reaction";
      key: string;
      at: string;
      person: Person;
      /** 1 for a love, -1 for a nah. */
      value: 1 | -1;
      /** What was reacted to: a rating, a Versus pick, or a take. */
      on: "rating" | "pick" | "take";
      subject: { title: string; href: string };
      /** For a pick, the artist they picked. */
      picked?: string;
    }
  /** Today's Daily Versus is up and they haven't picked yet. */
  | { kind: "versus-live"; key: string; at: string; matchup: VersusMatchup }
  /** A Versus they picked in has closed. */
  | { kind: "versus-result"; key: string; at: string; result: VersusResult };

type ReactionRow = {
  id: number;
  value: number;
  created_at: string;
  profiles: Person;
  ratings?: { releases: { mbid: string; title: string } | null };
  artist_ratings?: { artists: { mbid: string; name: string } | null };
  versus_votes?: { pick: VersusSideKey; versus_matchups: MatchupRow | null };
  versus_takes?: { versus_matchups: MatchupRow | null };
};

const PERSON = "profiles!inner ( id, username, display_name, avatar_url )";

/**
 * What's happened to somebody lately: new followers, loves and nahs on their
 * ratings, and the Daily Versus. Worked out from those tables on request, like
 * the feed, so there's nothing extra to store or keep in step.
 */
export async function getNotifications(
  userId: string,
  limit = 50,
): Promise<Notification[]> {
  const supabase = await createClient();
  const newest = { ascending: false } as const;

  const [
    follows,
    albumReactions,
    artistReactions,
    pickReactions,
    takeReactions,
    pickedToday,
    today,
    results,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id, created_at")
      .eq("following_id", userId)
      .order("created_at", newest)
      .limit(limit),
    supabase
      .from("reactions")
      .select(`id, value, created_at, ${PERSON}, ratings!inner ( user_id, releases ( mbid, title ) )`)
      .eq("ratings.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(limit),
    supabase
      .from("reactions")
      .select(
        `id, value, created_at, ${PERSON}, artist_ratings!inner ( user_id, artists ( mbid, name ) )`,
      )
      .eq("artist_ratings.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(limit),
    // These two read nothing until picks and takes can take reactions.
    supabase
      .from("reactions")
      .select(
        `id, value, created_at, ${PERSON}, versus_votes!inner ( user_id, pick, versus_matchups ( ${MATCHUP_SELECT} ) )`,
      )
      .eq("versus_votes.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(limit),
    supabase
      .from("reactions")
      .select(
        `id, value, created_at, ${PERSON}, versus_takes!inner ( user_id, versus_matchups ( ${MATCHUP_SELECT} ) )`,
      )
      .eq("versus_takes.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(limit),
    hasPickedToday(userId),
    getTodaysMatchup(),
    getRecentResults(userId),
  ]);

  // Follows point at accounts rather than profiles, so their names come separately.
  const followRows = (follows.data ?? []) as { follower_id: string; created_at: string }[];
  const { data: followers } =
    followRows.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in(
            "id",
            followRows.map((row) => row.follower_id),
          )
      : { data: [] };
  const people = new Map(((followers ?? []) as Person[]).map((p) => [p.id, p]));

  const notifications: Notification[] = [
    ...followRows.flatMap((row): Notification[] => {
      const person = people.get(row.follower_id);
      return person
        ? [{ kind: "follow", key: `follow-${row.follower_id}`, at: row.created_at, person }]
        : [];
    }),
    ...((albumReactions.data ?? []) as unknown as ReactionRow[]).flatMap(
      (row): Notification[] => {
        const release = row.ratings?.releases;
        return release
          ? [
              {
                kind: "reaction",
                key: `reaction-${row.id}`,
                at: row.created_at,
                person: row.profiles,
                value: row.value === 1 ? 1 : -1,
                on: "rating",
                subject: { title: release.title, href: `/album/${release.mbid}` },
              },
            ]
          : [];
      },
    ),
    ...((artistReactions.data ?? []) as unknown as ReactionRow[]).flatMap(
      (row): Notification[] => {
        const artist = row.artist_ratings?.artists;
        return artist
          ? [
              {
                kind: "reaction",
                key: `reaction-${row.id}`,
                at: row.created_at,
                person: row.profiles,
                value: row.value === 1 ? 1 : -1,
                on: "rating",
                subject: { title: artist.name, href: `/artist/${artist.mbid}` },
              },
            ]
          : [];
      },
    ),
    ...((pickReactions.data ?? []) as unknown as ReactionRow[]).flatMap(
      (row): Notification[] => {
        const vote = row.versus_votes;
        if (!vote?.versus_matchups) return [];
        const matchup = toMatchup(vote.versus_matchups);
        return [
          {
            kind: "reaction",
            key: `reaction-${row.id}`,
            at: row.created_at,
            person: row.profiles,
            value: row.value === 1 ? 1 : -1,
            on: "pick",
            subject: { title: matchup.title, href: `/versus/${matchup.day}` },
            picked: matchup[vote.pick].name,
          },
        ];
      },
    ),
    ...((takeReactions.data ?? []) as unknown as ReactionRow[]).flatMap(
      (row): Notification[] => {
        const take = row.versus_takes;
        if (!take?.versus_matchups) return [];
        const matchup = toMatchup(take.versus_matchups);
        return [
          {
            kind: "reaction",
            key: `reaction-${row.id}`,
            at: row.created_at,
            person: row.profiles,
            value: row.value === 1 ? 1 : -1,
            on: "take",
            subject: { title: matchup.title, href: `/versus/${matchup.day}` },
          },
        ];
      },
    ),
    ...(today && !pickedToday
      ? [
          {
            kind: "versus-live",
            key: `versus-live-${today.day}`,
            at: sydneyMidnight(today.day).toISOString(),
            matchup: today,
          } satisfies Notification,
        ]
      : []),
    ...results.map(
      (result): Notification => ({
        kind: "versus-result",
        key: `versus-result-${result.matchup.day}`,
        at: result.at,
        result,
      }),
    ),
  ];

  return notifications
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

/** The time of somebody's newest notification, for the dot on the bell. */
export async function getLatestNotificationAt(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const newest = { ascending: false } as const;

  const [follow, albumReaction, artistReaction, pickReaction, takeReaction, versus] =
    await Promise.all([
    supabase
      .from("follows")
      .select("created_at")
      .eq("following_id", userId)
      .order("created_at", newest)
      .limit(1),
    supabase
      .from("reactions")
      .select("created_at, ratings!inner ( user_id )")
      .eq("ratings.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(1),
    supabase
      .from("reactions")
      .select("created_at, artist_ratings!inner ( user_id )")
      .eq("artist_ratings.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(1),
    supabase
      .from("reactions")
      .select("created_at, versus_votes!inner ( user_id )")
      .eq("versus_votes.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(1),
    supabase
      .from("reactions")
      .select("created_at, versus_takes!inner ( user_id )")
      .eq("versus_takes.user_id", userId)
      .neq("user_id", userId)
      .order("created_at", newest)
      .limit(1),
    getLatestVersusAt(userId),
  ]);

  const times = [
    follow.data,
    albumReaction.data,
    artistReaction.data,
    pickReaction.data,
    takeReaction.data,
  ]
    .flatMap((rows) => (rows ?? []) as { created_at: string }[])
    .map((row) => row.created_at)
    .concat(versus ? [versus] : [])
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return times[0] ?? null;
}
