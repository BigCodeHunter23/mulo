import "server-only";
import { createClient } from "@/lib/supabase/server";

/** How many albums with genres it takes before a "sound" means anything. */
const MINIMUM_ALBUMS = 5;
const SHOWN = 3;

// MusicBrainz genre names are lower case; these read better another way.
const DISPLAY: Record<string, string> = {
  "alternative rock": "alt rock",
  "alternative hip hop": "alt hip hop",
  "alternative r&b": "alt R&B",
  "contemporary r&b": "contemporary R&B",
  "r&b": "R&B",
  "uk garage": "UK garage",
  "uk drill": "UK drill",
  edm: "EDM",
  idm: "IDM",
  "k-pop": "K-pop",
  "j-pop": "J-pop",
  "neo soul": "neo-soul",
};

type AlbumRow = { score: number; releases: { mbid: string; genres: string[] } };
type SongRow = { score: number; releases: { mbid: string; genres: string[] } };

/**
 * Somebody's sound, worked out from what they rate highly rather than asked
 * for. Albums scored 7 or more count, a 10 far more than a 7; loving an
 * album's songs counts towards it too, more lightly. Specific genres beat broad
 * ones, so it says "boom bap" rather than "hip hop" when both apply.
 */
export async function getSound(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const [albums, songs] = await Promise.all([
    supabase
      .from("ratings")
      .select("score, releases!inner ( mbid, genres )")
      .eq("user_id", userId)
      .gte("score", 7)
      .limit(1000),
    supabase
      .from("song_ratings")
      .select("score, releases!inner ( mbid, genres )")
      .eq("user_id", userId)
      .gte("score", 7)
      .limit(3000),
  ]);

  // How much each album counts: its own score if rated, otherwise half the
  // average of its songs' scores.
  const weight = new Map<string, { genres: string[]; value: number }>();

  for (const row of (albums.data ?? []) as unknown as AlbumRow[]) {
    if (row.releases.genres.length === 0) continue;
    weight.set(row.releases.mbid, { genres: row.releases.genres, value: row.score - 6 });
  }

  const songScores = new Map<string, { genres: string[]; scores: number[] }>();
  for (const row of (songs.data ?? []) as unknown as SongRow[]) {
    if (weight.has(row.releases.mbid) || row.releases.genres.length === 0) continue;
    const entry = songScores.get(row.releases.mbid) ?? {
      genres: row.releases.genres,
      scores: [],
    };
    entry.scores.push(row.score);
    songScores.set(row.releases.mbid, entry);
  }
  for (const [mbid, entry] of songScores) {
    const mean = entry.scores.reduce((sum, s) => sum + s, 0) / entry.scores.length;
    weight.set(mbid, { genres: entry.genres, value: (mean - 6) / 2 });
  }

  if (weight.size < MINIMUM_ALBUMS) return [];

  const totals = new Map<string, number>();
  for (const { genres, value } of weight.values()) {
    for (const genre of genres) {
      totals.set(genre, (totals.get(genre) ?? 0) + value);
    }
  }

  // A longer name is usually a more specific scene; nudge those ahead.
  const ranked = [...totals.entries()]
    .map(([genre, total]) => ({
      genre,
      score: total * (1 + 0.25 * (genre.split(" ").length - 1)),
    }))
    .sort((a, b) => b.score - a.score);

  // Whole words, not letters: "rap" narrows to "pop rap", but not to "trap".
  const words = (genre: string) => new Set(genre.split(/[\s-]+/));
  const narrows = (broad: string, narrow: string) =>
    [...words(broad)].every((word) => words(narrow).has(word));

  const chosen: string[] = [];
  // Families already represented: once "conscious hip hop" is in, no other
  // kind of hip hop takes a second slot.
  const families: string[] = [];
  const clashes = (genre: string) =>
    chosen.some((c) => narrows(c, genre) || narrows(genre, c)) ||
    families.some((family) => narrows(family, genre));

  for (const { genre, score } of ranked) {
    if (clashes(genre)) continue;

    // A broad genre gives way to its most popular narrower one, as long as
    // that one carries real weight of its own. Broad tags like "hip hop" sit
    // on nearly every album in their family, so the bar is 40%, not half.
    const narrower = ranked.find(
      (r) =>
        r.genre !== genre &&
        narrows(genre, r.genre) &&
        r.score >= score * 0.4 &&
        !clashes(r.genre),
    );
    const pick = narrower?.genre ?? genre;

    chosen.push(pick);
    for (const r of ranked) {
      if (r.genre !== pick && narrows(r.genre, pick)) families.push(r.genre);
    }
    if (chosen.length === SHOWN) break;
  }

  return chosen.map((genre) => DISPLAY[genre] ?? genre);
}
