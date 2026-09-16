import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getLatestVersusAt,
  getRecentResults,
  getTodaysMatchup,
  hasPickedToday,
  sydneyMidnight,
} from "@/lib/versus";
import type { VersusMatchup, VersusResult } from "@/lib/versus-shared";

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
      subject: { title: string; href: string };
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
                subject: { title: artist.name, href: `/artist/${artist.mbid}` },
              },
            ]
          : [];
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

  const [follow, albumReaction, artistReaction, versus] = await Promise.all([
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
    getLatestVersusAt(userId),
  ]);

  const times = [follow.data, albumReaction.data, artistReaction.data]
    .flatMap((rows) => (rows ?? []) as { created_at: string }[])
    .map((row) => row.created_at)
    .concat(versus ? [versus] : [])
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return times[0] ?? null;
}
