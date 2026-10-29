import "server-only";
import { hiddenPeople } from "@/lib/blocks";
import { createClient } from "@/lib/supabase/server";
import { getReplyNotifications, latestReplyActivityAt } from "@/lib/reply-notifications";
import { getFollowingIds } from "@/lib/social";
import {
  getLatestVersusAt,
  getRecentResults,
  getTodaysMatchup,
  hasPickedToday,
  MATCHUP_SELECT,
  sydneyMidnight,
  toMatchup,
} from "@/lib/versus";
import type { Notification, Person } from "@/lib/app-api";
import { sideKey } from "@/lib/versus-shared";

/** When somebody last opened their notifications, kept per browser. */
export const SEEN_COOKIE = "mulo_notifications_seen";

export type { Notification, Person };

const PERSON = "profiles!inner ( id, username, display_name, avatar_url )";

/**
 * Records somebody you follow has rated that you have rated too.
 *
 * Start from their newest ratings rather than your whole library: it is a
 * bounded query however much either of you has rated, and old news is not
 * worth a notification anyway.
 */
async function alsoRated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  limit: number,
): Promise<Notification[]> {
  const following = await getFollowingIds(userId);
  if (following.length === 0) return [];

  const { data: theirs } = await supabase
    .from("ratings")
    .select("user_id, release_mbid, score, updated_at")
    .in("user_id", following)
    .order("updated_at", { ascending: false })
    .limit(limit * 2);
  const rows = (theirs ?? []) as {
    user_id: string;
    release_mbid: string;
    score: number;
    updated_at: string;
  }[];
  if (rows.length === 0) return [];

  const [{ data: mine }, { data: releases }, { data: people }] = await Promise.all([
    supabase
      .from("ratings")
      .select("release_mbid, score")
      .eq("user_id", userId)
      .in("release_mbid", [...new Set(rows.map((r) => r.release_mbid))]),
    supabase
      .from("releases")
      .select("mbid, title")
      .in("mbid", [...new Set(rows.map((r) => r.release_mbid))]),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", [...new Set(rows.map((r) => r.user_id))]),
  ]);

  const myScores = new Map(
    ((mine ?? []) as { release_mbid: string; score: number }[]).map((r) => [
      r.release_mbid,
      r.score,
    ]),
  );
  const titles = new Map(
    ((releases ?? []) as { mbid: string; title: string }[]).map((r) => [r.mbid, r.title]),
  );
  const persons = new Map(((people ?? []) as Person[]).map((p) => [p.id, p]));

  return rows.flatMap((row): Notification[] => {
    const yours = myScores.get(row.release_mbid);
    const person = persons.get(row.user_id);
    const title = titles.get(row.release_mbid);
    if (yours === undefined || !person || !title) return [];
    return [
      {
        kind: "also-rated",
        key: `also-${row.user_id}-${row.release_mbid}`,
        at: row.updated_at,
        person,
        subject: { title, href: `/album/${row.release_mbid}` },
        yours,
        theirs: row.score,
      },
    ];
  });
}

/**
 * What's happened to somebody lately: new followers, loves and nahs on their
 * ratings, replies and mentions, and the Daily Versus. Worked out from those tables on request, like
 * the feed, so there's nothing extra to store or keep in step.
 */
export async function getNotifications(userId: string, limit = 50): Promise<Notification[]> {
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
    shared,
    replies,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id, created_at")
      .eq("following_id", userId)
      .order("created_at", newest)
      .limit(limit),
    supabase
      .from("reactions")
      .select(
        `id, value, created_at, ${PERSON}, ratings!inner ( user_id, releases ( mbid, title ) )`,
      )
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
    alsoRated(supabase, userId, limit),
    getReplyNotifications(userId, limit),
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
    ...shared,
    ...replies,
    ...followRows.flatMap((row): Notification[] => {
      const person = people.get(row.follower_id);
      return person
        ? [{ kind: "follow", key: `follow-${row.follower_id}`, at: row.created_at, person }]
        : [];
    }),
    ...(albumReactions.data ?? []).flatMap((row): Notification[] => {
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
    }),
    ...(artistReactions.data ?? []).flatMap((row): Notification[] => {
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
    }),
    ...(pickReactions.data ?? []).flatMap((row): Notification[] => {
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
          picked: matchup[sideKey(vote.pick)].name,
        },
      ];
    }),
    ...(takeReactions.data ?? []).flatMap((row): Notification[] => {
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
    }),
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
    ...results.map((result): Notification => ({
      kind: "versus-result",
      key: `versus-result-${result.matchup.day}`,
      at: result.at,
      result,
    })),
  ];

  // Somebody blocked, either way round, has nothing to say here.
  const hidden = await hiddenPeople();
  return notifications
    .filter((notification) => !("person" in notification && hidden.has(notification.person.id)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

/** How many of each kind to look through, in case the newest are from somebody blocked. */
const LATEST_LOOK = 5;

/**
 * The time of somebody's newest notification, for the dot on the bell.
 * Somebody blocked, either way round, doesn't light it.
 */
export async function getLatestNotificationAt(userId: string): Promise<string | null> {
  const [supabase, hidden] = await Promise.all([createClient(), hiddenPeople()]);
  const newest = { ascending: false } as const;

  const [follow, albumReaction, artistReaction, pickReaction, takeReaction, versus, reply] =
    await Promise.all([
      supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", userId)
        .order("created_at", newest)
        .limit(LATEST_LOOK),
      supabase
        .from("reactions")
        .select("user_id, created_at, ratings!inner ( user_id )")
        .eq("ratings.user_id", userId)
        .neq("user_id", userId)
        .order("created_at", newest)
        .limit(LATEST_LOOK),
      supabase
        .from("reactions")
        .select("user_id, created_at, artist_ratings!inner ( user_id )")
        .eq("artist_ratings.user_id", userId)
        .neq("user_id", userId)
        .order("created_at", newest)
        .limit(LATEST_LOOK),
      supabase
        .from("reactions")
        .select("user_id, created_at, versus_votes!inner ( user_id )")
        .eq("versus_votes.user_id", userId)
        .neq("user_id", userId)
        .order("created_at", newest)
        .limit(LATEST_LOOK),
      supabase
        .from("reactions")
        .select("user_id, created_at, versus_takes!inner ( user_id )")
        .eq("versus_takes.user_id", userId)
        .neq("user_id", userId)
        .order("created_at", newest)
        .limit(LATEST_LOOK),
      getLatestVersusAt(userId),
      // Times only; row-level security already leaves out anybody hidden.
      latestReplyActivityAt(userId),
    ]);

  const times = [
    follow.data,
    albumReaction.data,
    artistReaction.data,
    pickReaction.data,
    takeReaction.data,
  ]
    .flatMap(
      (rows) => (rows ?? []) as { created_at: string; user_id?: string; follower_id?: string }[],
    )
    .filter((row) => !hidden.has(row.user_id ?? row.follower_id ?? ""))
    .map((row) => row.created_at)
    .concat(versus ? [versus] : [])
    .concat(reply ? [reply] : [])
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return times[0] ?? null;
}
