import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { coverSrc } from "@/lib/cover-url";

export type RotationAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  /** Different people who rated the album or its songs in the window. */
  people: number;
  average: number;
};

export type HeavyRotation = {
  label: "this week" | "this month";
  albums: RotationAlbum[];
};

const WINDOWS = [
  { days: 7, label: "this week" },
  { days: 30, label: "this month" },
] as const;

/** Fewer albums in play than this and a ranking means nothing. */
const MINIMUM_ALBUMS = 4;

/** "Hot" means a crowd. Below this it would just be somebody's own ratings. */
const MINIMUM_PEOPLE = 3;

type Activity = {
  release_mbid: string;
  user_id: string;
  score: number;
  created_at: string;
};

type ReleaseRow = {
  mbid: string;
  title: string;
  artist_credit: string | null;
  cover_art_url: string | null;
  artists: { name: string } | { name: string }[] | null;
};

/**
 * What MULO has in heavy rotation, from MULO's own activity rather than an
 * outside chart. ListenBrainz's weekly chart was the obvious source, but its
 * user base is small enough for one fandom to fill it.
 *
 * Heat is counted in people, not ratings, so one keen listener can't make an
 * album hot alone; rating an album's songs counts towards the album. The week
 * is used when there is enough going on, the month when there isn't, and
 * nothing at all when even the month is too quiet to rank.
 */
export async function getHeavyRotation(
  limit = 10,
): Promise<HeavyRotation | null> {
  const supabase = createPublicClient();

  for (const window of WINDOWS) {
    const since = new Date(Date.now() - window.days * 86_400_000).toISOString();

    const [albums, songs] = await Promise.all([
      supabase
        .from("ratings")
        .select("release_mbid, user_id, score, created_at")
        .gte("created_at", since)
        .limit(5000),
      supabase
        .from("song_ratings")
        .select("release_mbid, user_id, score, created_at")
        .gte("created_at", since)
        .limit(10000),
    ]);

    const activity = [...(albums.data ?? []), ...(songs.data ?? [])] as Activity[];
    if (new Set(activity.map((row) => row.user_id)).size < MINIMUM_PEOPLE) continue;

    const heat = new Map<
      string,
      { people: Set<string>; ratings: number; total: number; latest: string }
    >();

    for (const row of activity) {
      const entry = heat.get(row.release_mbid) ?? {
        people: new Set<string>(),
        ratings: 0,
        total: 0,
        latest: row.created_at,
      };
      entry.people.add(row.user_id);
      entry.ratings += 1;
      entry.total += row.score;
      if (row.created_at > entry.latest) entry.latest = row.created_at;
      heat.set(row.release_mbid, entry);
    }

    if (heat.size < MINIMUM_ALBUMS) continue;

    const ranked = [...heat.entries()]
      .sort(
        ([, a], [, b]) =>
          b.people.size - a.people.size ||
          b.ratings - a.ratings ||
          b.latest.localeCompare(a.latest),
      )
      .slice(0, limit);

    const { data } = await supabase
      .from("releases")
      .select("mbid, title, artist_credit, cover_art_url, artists ( name )")
      .in(
        "mbid",
        ranked.map(([mbid]) => mbid),
      );

    const details = new Map(
      ((data ?? []) as unknown as ReleaseRow[]).map((row) => [row.mbid, row]),
    );

    const hot = ranked.flatMap(([mbid, entry]) => {
      const row = details.get(mbid);
      if (!row) return [];
      const joined = Array.isArray(row.artists) ? row.artists[0] : row.artists;

      return [
        {
          mbid,
          title: row.title,
          artist: row.artist_credit ?? joined?.name ?? null,
          cover: coverSrc(row.cover_art_url, 250),
          people: entry.people.size,
          average: entry.total / entry.ratings,
        },
      ];
    });

    if (hot.length >= MINIMUM_ALBUMS) return { label: window.label, albums: hot };
  }

  return null;
}
