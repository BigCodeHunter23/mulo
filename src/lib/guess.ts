import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getScoresForReleases } from "@/lib/ratings";

/**
 * Guess the score: a record, a slider, and how close you got to what everyone
 * on MULO gave it. No rating required, which is the point — it's a way in for
 * somebody who hasn't settled into rating yet, and every round is a record
 * they might go and rate afterwards.
 *
 * The answer is exactly the gold "Everyone" score shown on the album's page,
 * starting score included, so nothing here can disagree with the rest of the
 * site.
 */

export type GuessAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
  score: number;
};

/** Albums people are likely to recognise, to draw a game from. */
const POOL = 400;

export async function getGuessGame(rounds = 10): Promise<GuessAlbum[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("releases")
    .select("mbid, title, artist_credit, cover_art_url, release_date")
    .not("cover_art_url", "is", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(POOL);

  const rows = (data ?? []) as {
    mbid: string;
    title: string;
    artist_credit: string | null;
    cover_art_url: string | null;
    release_date: string | null;
  }[];

  // Shuffle, then keep the first ones that have a score to guess at.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const candidates = rows.slice(0, rounds * 4);
  const scores = await getScoresForReleases(candidates.map((row) => row.mbid));

  return candidates
    .filter((row) => scores.has(row.mbid))
    .slice(0, rounds)
    .map((row) => ({
      mbid: row.mbid,
      title: row.title,
      artist: row.artist_credit,
      cover: row.cover_art_url,
      year: row.release_date?.slice(0, 4) ?? null,
      score: Math.round(scores.get(row.mbid)! * 10) / 10,
    }));
}
