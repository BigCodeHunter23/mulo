import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type TasteMatch = {
  /** Out of 100: how closely two people score the same records. */
  percent: number;
  /** How many things they have both rated. */
  shared: number;
  /** Where they disagree most, which is the fun part. */
  clash: {
    title: string;
    subtitle: string | null;
    href: string;
    yours: number;
    theirs: number;
  } | null;
};

type Pair = {
  kind: "album" | "artist" | "song";
  mbid: string;
  releaseMbid?: string;
  yours: number;
  theirs: number;
};

/** Below this there isn't enough in common to mean anything. */
const MINIMUM = 5;

/** A gap this wide is worth pointing out. */
const CLASH = 2;

/**
 * How closely the signed-in person and somebody else score the same music.
 * A perfect match is identical scores; the widest possible gap is nine points,
 * so the percentage is how much of that gap they avoid on average.
 */
export async function getTasteMatch(
  otherUserId: string,
): Promise<TasteMatch | null> {
  const user = await getCurrentUser();
  if (!user || user.id === otherUserId) return null;

  const supabase = await createClient();
  const viewerId = user.id;
  const both = [viewerId, otherUserId];

  const [albums, artists, songs] = await Promise.all([
    supabase
      .from("ratings")
      .select("user_id, release_mbid, score")
      .in("user_id", both)
      .limit(4000),
    supabase
      .from("artist_ratings")
      .select("user_id, artist_mbid, score")
      .in("user_id", both)
      .limit(4000),
    supabase
      .from("song_ratings")
      .select("user_id, song_mbid, release_mbid, score")
      .in("user_id", both)
      .limit(8000),
  ]);

  const pairs: Pair[] = [];

  type Rated = { user_id: string; score: number };

  function collect<T extends Rated>(
    rows: T[],
    kind: Pair["kind"],
    key: (row: T) => string,
    release?: (row: T) => string,
  ) {
    const mine = new Map<string, number>();
    const theirs = new Map<string, number>();
    const releases = new Map<string, string>();

    for (const row of rows) {
      const id = key(row);
      (row.user_id === viewerId ? mine : theirs).set(id, row.score);
      if (release) releases.set(id, release(row));
    }

    for (const [mbid, yours] of mine) {
      const score = theirs.get(mbid);
      if (score === undefined) continue;
      pairs.push({ kind, mbid, releaseMbid: releases.get(mbid), yours, theirs: score });
    }
  }

  collect(
    (albums.data ?? []) as (Rated & { release_mbid: string })[],
    "album",
    (row) => row.release_mbid,
  );
  collect(
    (artists.data ?? []) as (Rated & { artist_mbid: string })[],
    "artist",
    (row) => row.artist_mbid,
  );
  collect(
    (songs.data ?? []) as (Rated & { song_mbid: string; release_mbid: string })[],
    "song",
    (row) => row.song_mbid,
    (row) => row.release_mbid,
  );

  if (pairs.length < MINIMUM) return null;

  const gap =
    pairs.reduce((sum, pair) => sum + Math.abs(pair.yours - pair.theirs), 0) /
    pairs.length;
  const percent = Math.max(0, Math.min(100, Math.round(100 - (gap / 9) * 100)));

  const worst = [...pairs].sort(
    (a, b) => Math.abs(b.yours - b.theirs) - Math.abs(a.yours - a.theirs),
  )[0];

  let clash: TasteMatch["clash"] = null;

  if (worst && Math.abs(worst.yours - worst.theirs) >= CLASH) {
    const scores = { yours: worst.yours, theirs: worst.theirs };

    if (worst.kind === "album") {
      const { data } = await supabase
        .from("releases")
        .select("title, artist_credit")
        .eq("mbid", worst.mbid)
        .maybeSingle();
      if (data) {
        clash = {
          title: String(data.title),
          subtitle: (data.artist_credit as string | null) ?? null,
          href: `/album/${worst.mbid}`,
          ...scores,
        };
      }
    } else if (worst.kind === "artist") {
      const { data } = await supabase
        .from("artists")
        .select("name")
        .eq("mbid", worst.mbid)
        .maybeSingle();
      if (data) {
        clash = {
          title: String(data.name),
          subtitle: null,
          href: `/artist/${worst.mbid}`,
          ...scores,
        };
      }
    } else {
      const { data } = await supabase
        .from("songs")
        .select("title")
        .eq("mbid", worst.mbid)
        .maybeSingle();
      if (data && worst.releaseMbid) {
        clash = {
          title: String(data.title),
          subtitle: null,
          href: `/album/${worst.releaseMbid}`,
          ...scores,
        };
      }
    }
  }

  return { percent, shared: pairs.length, clash };
}
