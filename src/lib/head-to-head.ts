import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * You against one other person, on everything you have both rated.
 *
 * Taste twin picks somebody for you once a week; this is the page you open
 * about a particular person and keep coming back to. The numbers get sharper
 * as two people rate more, which is the opposite of most social features —
 * an agreement figure between two friends means something, where an average
 * across five hundred strangers means nothing.
 *
 * Nothing is stored. It is a query over two people's ratings, the same way
 * the feed and the taste match already work.
 */

export type Clash = {
  title: string;
  subtitle: string | null;
  href: string;
  coverUrl: string | null;
  yours: number;
  theirs: number;
};

export type BlindSpot = {
  title: string;
  subtitle: string | null;
  href: string;
  coverUrl: string | null;
  score: number;
};

export type HeadToHead = {
  /** False when there isn't enough in common yet; only `shared` means anything. */
  ready: boolean;
  percent: number;
  shared: number;
  /** Rated exactly the same. */
  identical: number;
  /** Within a point of each other. */
  close: number;
  /** Three or more apart — the arguments. */
  apart: number;
  clashes: Clash[];
  agreements: Clash[];
  /** They rate it highly and you have never rated it. */
  fromThem: BlindSpot[];
  /** You rate it highly and they have never rated it. */
  fromYou: BlindSpot[];
};

/** Below this there is not enough in common for any of it to mean anything. */
export const MINIMUM = 8;
/** A gap this wide is an argument rather than a rounding difference. */
const APART = 3;
/** What counts as "they love it" for a recommendation. */
const LOVED = 8;
const SHOWN = 6;

type Rated = { user_id: string; score: number };

/**
 * Every row of a query, a page at a time: PostgREST caps a single request at
 * 1,000 rows whatever `.limit()` asks for.
 */
async function allRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) break;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

export async function getHeadToHead(otherUserId: string): Promise<HeadToHead | null> {
  const user = await getCurrentUser();
  if (!user || user.id === otherUserId) return null;

  const supabase = await createClient();
  const you = user.id;
  const both = [you, otherUserId];

  const [albumRows, artistRows] = await Promise.all([
    allRows<Rated & { release_mbid: string }>((from, to) =>
      supabase
        .from("ratings")
        .select("user_id, release_mbid, score")
        .in("user_id", both)
        .range(from, to),
    ),
    allRows<Rated & { artist_mbid: string }>((from, to) =>
      supabase
        .from("artist_ratings")
        .select("user_id, artist_mbid, score")
        .in("user_id", both)
        .range(from, to),
    ),
  ]);

  const yourAlbums = new Map<string, number>();
  const theirAlbums = new Map<string, number>();
  for (const row of albumRows) {
    (row.user_id === you ? yourAlbums : theirAlbums).set(row.release_mbid, row.score);
  }

  const yourArtists = new Map<string, number>();
  const theirArtists = new Map<string, number>();
  for (const row of artistRows) {
    (row.user_id === you ? yourArtists : theirArtists).set(row.artist_mbid, row.score);
  }

  type Pair = { kind: "album" | "artist"; mbid: string; yours: number; theirs: number };
  const pairs: Pair[] = [];
  for (const [mbid, yours] of yourAlbums) {
    const theirs = theirAlbums.get(mbid);
    if (theirs !== undefined) pairs.push({ kind: "album", mbid, yours, theirs });
  }
  for (const [mbid, yours] of yourArtists) {
    const theirs = theirArtists.get(mbid);
    if (theirs !== undefined) pairs.push({ kind: "artist", mbid, yours, theirs });
  }

  // Say how far off it is rather than nothing at all: a pair of new accounts
  // should see the bar they are working towards, not a dead end.
  if (pairs.length < MINIMUM) {
    return {
      ready: false,
      percent: 0,
      shared: pairs.length,
      identical: 0,
      close: 0,
      apart: 0,
      clashes: [],
      agreements: [],
      fromThem: [],
      fromYou: [],
    };
  }

  const totalGap = pairs.reduce((sum, p) => sum + Math.abs(p.yours - p.theirs), 0);
  // The widest possible gap is nine points, so this is how much of it you avoid.
  const percent = Math.max(0, Math.min(100, Math.round(100 - (totalGap / pairs.length / 9) * 100)));

  const identical = pairs.filter((p) => p.yours === p.theirs).length;
  const close = pairs.filter((p) => Math.abs(p.yours - p.theirs) <= 1).length;
  const apart = pairs.filter((p) => Math.abs(p.yours - p.theirs) >= APART).length;

  const byGap = [...pairs].sort(
    (a, b) => Math.abs(b.yours - b.theirs) - Math.abs(a.yours - a.theirs),
  );
  const worst = byGap.filter((p) => Math.abs(p.yours - p.theirs) >= APART).slice(0, SHOWN);

  // Both love it: ranked by the lower of the two scores, so the pick is one
  // neither of you is lukewarm about.
  const best = pairs
    .filter((p) => Math.min(p.yours, p.theirs) >= LOVED)
    .sort((a, b) => Math.min(b.yours, b.theirs) - Math.min(a.yours, a.theirs))
    .slice(0, SHOWN);

  const theirPicks = [...theirAlbums.entries()]
    .filter(([mbid, score]) => score >= LOVED && !yourAlbums.has(mbid))
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN);
  const yourPicks = [...yourAlbums.entries()]
    .filter(([mbid, score]) => score >= LOVED && !theirAlbums.has(mbid))
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN);

  // One lookup each for the names and covers everything above needs.
  const albumIds = [
    ...worst.filter((p) => p.kind === "album").map((p) => p.mbid),
    ...best.filter((p) => p.kind === "album").map((p) => p.mbid),
    ...theirPicks.map(([mbid]) => mbid),
    ...yourPicks.map(([mbid]) => mbid),
  ];
  const artistIds = [
    ...worst.filter((p) => p.kind === "artist").map((p) => p.mbid),
    ...best.filter((p) => p.kind === "artist").map((p) => p.mbid),
  ];

  const [releases, artists] = await Promise.all([
    albumIds.length
      ? supabase
          .from("releases")
          .select("mbid, title, artist_credit, cover_art_url")
          .in("mbid", [...new Set(albumIds)])
      : Promise.resolve({ data: [] }),
    artistIds.length
      ? supabase.from("artists").select("mbid, name, image_url").in("mbid", [...new Set(artistIds)])
      : Promise.resolve({ data: [] }),
  ]);

  const releaseById = new Map(
    ((releases.data ?? []) as {
      mbid: string;
      title: string;
      artist_credit: string | null;
      cover_art_url: string | null;
    }[]).map((r) => [r.mbid, r]),
  );
  const artistById = new Map(
    ((artists.data ?? []) as { mbid: string; name: string; image_url: string | null }[]).map((a) => [
      a.mbid,
      a,
    ]),
  );

  function describe(pair: Pair): Clash | null {
    if (pair.kind === "album") {
      const release = releaseById.get(pair.mbid);
      if (!release) return null;
      return {
        title: release.title,
        subtitle: release.artist_credit,
        href: `/album/${pair.mbid}`,
        coverUrl: release.cover_art_url,
        yours: pair.yours,
        theirs: pair.theirs,
      };
    }
    const artist = artistById.get(pair.mbid);
    if (!artist) return null;
    return {
      title: artist.name,
      subtitle: null,
      href: `/artist/${pair.mbid}`,
      coverUrl: artist.image_url,
      yours: pair.yours,
      theirs: pair.theirs,
    };
  }

  function spot([mbid, score]: [string, number]): BlindSpot | null {
    const release = releaseById.get(mbid);
    if (!release) return null;
    return {
      title: release.title,
      subtitle: release.artist_credit,
      href: `/album/${mbid}`,
      coverUrl: release.cover_art_url,
      score,
    };
  }

  return {
    ready: true,
    percent,
    shared: pairs.length,
    identical,
    close,
    apart,
    clashes: worst.map(describe).filter((c): c is Clash => c !== null),
    agreements: best.map(describe).filter((c): c is Clash => c !== null),
    fromThem: theirPicks.map(spot).filter((s): s is BlindSpot => s !== null),
    fromYou: yourPicks.map(spot).filter((s): s is BlindSpot => s !== null),
  };
}
