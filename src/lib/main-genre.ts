import { GENRE_FAMILIES } from "@/lib/badge-catalog";

/**
 * An artist's main genre, strictly — for places like The Charts where somebody
 * should only turn up under the genre they're known for.
 *
 * The badge ladders match generously: any word in any tag counts, so "pop
 * rap" counts towards both pop and hip hop. Fine for rewarding somebody who
 * listens widely, wrong for a chart: it put Kendrick Lamar in the top pop
 * albums and Kid Cudi in electronic.
 *
 * Two rules make it strict:
 *
 *   1. A tag is what its last word says it is. "Pop rap" is a kind of rap,
 *      "psychedelic rock" a kind of rock, "dance-pop" a kind of pop. Earlier
 *      words only describe it. ("Hip hop" is read as one word.)
 *   2. An artist has one main genre: whichever family their albums' tags
 *      point at most often, all their albums together. Their albums and songs
 *      follow it, so an artist never appears in a genre they only dabbled in.
 */

/** The family a single tag belongs to, by its head word. */
export function headFamily(tag: string): string | null {
  const words = tag
    .toLowerCase()
    .replace(/hip[\s-]?hop/g, "hiphop")
    .split(/[^a-z&]+/)
    .filter(Boolean);

  // From the last word backwards: "garage rock revival" is rock, because
  // "revival" belongs to no family and "rock" is the next word in.
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i] === "hiphop" ? "hop" : words[i];
    const family = GENRE_FAMILIES.find((f) => f.match.includes(word));
    if (family) return family.id;
  }
  return null;
}

/** The family a set of tags points at most, or null if none of them match. */
export function mainFamily(tags: string[]): string | null {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    const family = headFamily(tag);
    if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  let best: string | null = null;
  let most = 0;
  for (const [family, count] of counts) {
    if (count > most) {
      best = family;
      most = count;
    }
  }
  return best;
}

/**
 * Each artist's main family, from every tag on every one of their albums.
 * Takes the rows already fetched, so callers decide how to read them.
 */
export function mainFamiliesByArtist(
  releases: { artist_mbid: string | null; genres: string[] | null }[],
): Map<string, string | null> {
  const tags = new Map<string, string[]>();
  for (const release of releases) {
    if (!release.artist_mbid) continue;
    const list = tags.get(release.artist_mbid) ?? [];
    list.push(...(release.genres ?? []));
    tags.set(release.artist_mbid, list);
  }

  const result = new Map<string, string | null>();
  for (const [artist, list] of tags) result.set(artist, mainFamily(list));
  return result;
}
