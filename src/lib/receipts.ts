import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/errors";

/**
 * Receipts: a score you gave a while ago, put back in front of you.
 *
 * Opinions move. A record that was a 9 the week it came out is often an 8 two
 * years later, and the only way MULO ever finds out is by asking. It doubles
 * as a reason to open the app on a day when nothing else is happening.
 *
 * Saying "still" counts as rating it again, which moves its updated_at and
 * takes it out of the running — so nothing has to remember what was asked.
 */

/**
 * How long a score has to sit untouched before it is worth asking about. A
 * month is long enough that an opinion has settled, and short enough that the
 * question comes round while MULO is young.
 */
const SETTLED_DAYS = 30;

/** How many of the oldest to choose between, so it isn't the same one daily. */
const CANDIDATES = 8;

export type Receipt = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  /** What they gave it, and when. */
  score: number;
  rated_at: string;
  /** Everybody else's average now, if anybody else has rated it. */
  everyone: number | null;
};

type Row = {
  release_mbid: string;
  score: number;
  updated_at: string;
  releases: {
    title: string;
    cover_art_url: string | null;
    artists: { name: string } | null;
  } | null;
};

/** The same day gives the same record, so a refresh doesn't reshuffle it. */
function pick<T>(candidates: T[], day: string): T {
  let sum = 0;
  for (const character of day) sum += character.charCodeAt(0);
  return candidates[sum % candidates.length];
}

export async function getReceipt(userId: string): Promise<Receipt | null> {
  const supabase = await createClient();

  const settled = new Date(Date.now() - SETTLED_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("ratings")
    .select(
      "release_mbid, score, updated_at, releases!inner ( title, cover_art_url, artists ( name ) )",
    )
    .eq("user_id", userId)
    .lt("updated_at", settled)
    .order("updated_at", { ascending: true })
    .limit(CANDIDATES);

  if (error) {
    logQueryError("receipts", error);
    return null;
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;

  const row = pick(rows, new Date().toISOString().slice(0, 10));
  if (!row.releases) return null;

  const { data: totals, error: totalsError } = await supabase.rpc("score_totals", {
    p_kind: "album",
    p_mbids: [row.release_mbid],
    p_skip_user: userId,
  });
  if (totalsError) logQueryError("receipts", totalsError, "0018");

  const average = totals?.[0]?.average ?? null;

  return {
    mbid: row.release_mbid,
    title: row.releases.title,
    artist: row.releases.artists?.name ?? null,
    cover_art_url: row.releases.cover_art_url,
    score: row.score,
    rated_at: row.updated_at,
    everyone: average === null ? null : Math.round(average * 10) / 10,
  };
}

/** "two years ago", "eight months ago", "last month". */
export function howLongAgo(when: string): string {
  const days = Math.floor((Date.now() - new Date(when).getTime()) / (24 * 60 * 60 * 1000));
  if (days >= 730) return `${Math.floor(days / 365)} years ago`;
  if (days >= 365) return "a year ago";
  const months = Math.floor(days / 30);
  if (months >= 2) return `${months} months ago`;
  return "last month";
}
