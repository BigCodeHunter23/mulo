import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { mainFamiliesByArtist } from "@/lib/main-genre";

/**
 * Every artist's one main genre (see main-genre.ts), for the whole catalogue
 * at once.
 *
 * Worked out from every tagged album, read a thousand rows at a time: the
 * database never hands over more than that in one go, whatever the query
 * asks for, and a single request once quietly cut artists off halfway (Nas
 * came out with no genre at all). A few thousand tagged albums take a handful
 * of requests, and the answer is kept for an hour, since tags only change
 * when the catalogue grows.
 */

const HOUR = 3_600_000;
let cached: { at: number; map: Promise<Map<string, string | null>> } | null = null;

async function load(): Promise<Map<string, string | null>> {
  const supabase = createPublicClient();
  const rows: { artist_mbid: string | null; genres: string[] | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("releases")
      .select("artist_mbid, genres")
      .not("genres", "is", null)
      .order("mbid")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  return mainFamiliesByArtist(rows);
}

export function getArtistGenres(): Promise<Map<string, string | null>> {
  if (!cached || Date.now() - cached.at > HOUR) {
    const map = load();
    cached = { at: Date.now(), map };
    // A failed read shouldn't stick for an hour.
    map.catch(() => {
      cached = null;
    });
  }
  return cached.map;
}
