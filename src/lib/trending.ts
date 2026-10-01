import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { coverSrc } from "@/lib/cover-url";
import { logQueryError } from "@/lib/supabase/errors";

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

    // Ranked by the database (migration 0018), across every rating in the
    // window rather than the first thousand.
    const { data: heat, error } = await supabase.rpc("heavy_rotation", {
      p_since: since,
      p_limit: limit,
    });
    if (error) {
      logQueryError("trending", error, "0018");
      return null;
    }

    const ranked = (heat ?? []).flatMap((row) =>
      row.release_mbid && row.ratings && row.total !== null
        ? [{ ...row, release_mbid: row.release_mbid, ratings: row.ratings, total: row.total }]
        : [],
    );
    const busy = ranked[0];
    if (!busy || (busy.everyone ?? 0) < MINIMUM_PEOPLE) continue;
    if ((busy.albums ?? 0) < MINIMUM_ALBUMS) continue;

    const { data } = await supabase
      .from("releases")
      .select("mbid, title, artist_credit, cover_art_url, artists ( name )")
      .in(
        "mbid",
        ranked.map((entry) => entry.release_mbid),
      );

    const details = new Map(
      ((data ?? []) as unknown as ReleaseRow[]).map((row) => [row.mbid, row]),
    );

    const hot = ranked.flatMap((entry) => {
      const mbid = entry.release_mbid;
      const row = details.get(mbid);
      if (!row) return [];
      const joined = Array.isArray(row.artists) ? row.artists[0] : row.artists;

      return [
        {
          mbid,
          title: row.title,
          artist: row.artist_credit ?? joined?.name ?? null,
          cover: coverSrc(row.cover_art_url, 250),
          people: entry.people ?? 0,
          average: entry.total / entry.ratings,
        },
      ];
    });

    if (hot.length >= MINIMUM_ALBUMS) return { label: window.label, albums: hot };
  }

  return null;
}
