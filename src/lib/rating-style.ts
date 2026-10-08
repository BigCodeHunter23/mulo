import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";
import { mainFamily } from "@/lib/main-genre";

/**
 * How one person rates, next to everybody else.
 *
 * A score on its own says nothing about the person who gave it — an 8 from
 * somebody who hands out tens means something different. Everything here is
 * the same comparison made different ways: their score against what everyone
 * else gave the same record, which migration 0018 counts in the database.
 */

/** Below this there isn't enough to say anything honest about somebody. */
export const ENOUGH_TO_JUDGE = 8;

export type Standout = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  yours: number;
  theirs: number;
  gap: number;
};

export type RatingStyle = {
  /** Albums they've rated that anybody else has rated too. */
  compared: number;
  /** Their average on those, and everyone else's. */
  yours: number;
  everyone: number;
  /** Positive: kinder than the crowd. Negative: harsher. */
  gap: number;
  /** The record they're furthest above the crowd on, and furthest below. */
  champion: Standout | null;
  sceptic: Standout | null;
  /** Decades and genres they're kindest and hardest on, with enough rated to mean it. */
  decades: { label: string; gap: number; count: number }[];
  genres: { label: string; gap: number; count: number }[];
};

type Row = {
  release_mbid: string;
  score: number;
  releases: {
    title: string;
    release_date: string | null;
    cover_art_url: string | null;
    genres: string[];
    artists: { name: string } | null;
  } | null;
};

/** Averages a list of gaps, rounded to one decimal place. */
const averageGap = (gaps: number[]) =>
  Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 10) / 10;

/** Groups with at least this many rated albums are worth naming. */
const ENOUGH_IN_A_GROUP = 3;

function group(
  rows: { label: string | null; gap: number }[],
): { label: string; gap: number; count: number }[] {
  const byLabel = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.label) continue;
    byLabel.set(row.label, [...(byLabel.get(row.label) ?? []), row.gap]);
  }

  return [...byLabel.entries()]
    .filter(([, gaps]) => gaps.length >= ENOUGH_IN_A_GROUP)
    .map(([label, gaps]) => ({ label, gap: averageGap(gaps), count: gaps.length }))
    .sort((a, b) => b.gap - a.gap);
}

export async function getRatingStyle(userId: string): Promise<RatingStyle | null> {
  const supabase = await createClient();

  const { data: mine, error } = await readAll<Row>((from, to) =>
    supabase
      .from("ratings")
      .select(
        "release_mbid, score, releases!inner ( title, release_date, cover_art_url, genres, artists ( name ) )",
      )
      .eq("user_id", userId)
      .order("release_mbid")
      .range(from, to),
  );
  if (error) logQueryError("rating style", error);
  if (mine.length === 0) return null;

  // Everyone else's average for the same records, counted in the database and
  // with this person's own score left out — otherwise they'd be comparing
  // themselves partly against themselves.
  const { data: totals, error: totalsError } = await supabase.rpc("score_totals", {
    p_kind: "album",
    p_mbids: mine.map((row) => row.release_mbid),
    p_skip_user: userId,
  });
  if (totalsError) logQueryError("rating style", totalsError, "0018");

  const crowd = new Map(
    (totals ?? []).flatMap((row) =>
      row.mbid && row.average !== null ? [[row.mbid, row.average] as const] : [],
    ),
  );

  const compared = mine.flatMap((row) => {
    const theirs = crowd.get(row.release_mbid);
    if (theirs === undefined || !row.releases) return [];
    return [
      {
        mbid: row.release_mbid,
        title: row.releases.title,
        artist: row.releases.artists?.name ?? null,
        cover_art_url: row.releases.cover_art_url,
        yours: row.score,
        theirs: Math.round(theirs * 10) / 10,
        gap: row.score - theirs,
        decade: row.releases.release_date?.slice(0, 3)
          ? `${row.releases.release_date.slice(0, 3)}0s`
          : null,
        genre: mainFamily(row.releases.genres),
      },
    ];
  });

  if (compared.length < ENOUGH_TO_JUDGE) return null;

  const standout = (pick: "high" | "low"): Standout => {
    const best = compared.reduce((furthest, record) =>
      pick === "high"
        ? record.gap > furthest.gap
          ? record
          : furthest
        : record.gap < furthest.gap
          ? record
          : furthest,
    );
    return {
      mbid: best.mbid,
      title: best.title,
      artist: best.artist,
      cover_art_url: best.cover_art_url,
      yours: best.yours,
      theirs: best.theirs,
      gap: Math.round(best.gap * 10) / 10,
    };
  };

  const champion = standout("high");
  const sceptic = standout("low");

  return {
    compared: compared.length,
    yours: averageGap(compared.map((record) => record.yours)),
    everyone: averageGap(compared.map((record) => record.theirs)),
    gap: averageGap(compared.map((record) => record.gap)),
    // Only worth showing when they actually went above or below the crowd.
    champion: champion.gap > 0 ? champion : null,
    sceptic: sceptic.gap < 0 ? sceptic : null,
    decades: group(compared.map((record) => ({ label: record.decade, gap: record.gap }))),
    genres: group(compared.map((record) => ({ label: record.genre, gap: record.gap }))),
  };
}
