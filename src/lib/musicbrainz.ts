const API = "https://musicbrainz.org/ws/2";
// MusicBrainz requires requests to identify the app and a way to reach it.
// The site address serves as the contact rather than a personal email.
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
const MIN_INTERVAL_MS = 1100;

// MusicBrainz allows ~1 request/second. Chain every call through a single
// promise so concurrent callers queue instead of firing in parallel.
let queue: Promise<unknown> = Promise.resolve();

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)),
    () => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)),
  );
  return result;
}

/** Thrown when MusicBrainz has no such artist or release. */
export class MbNotFoundError extends Error {}

type FetchOptions = {
  /** Retries when MusicBrainz says it's busy. Patient work can wait; search can't. */
  retries?: number;
  /** Give up on one request after this long. */
  timeoutMs?: number;
};

async function mbFetch<T>(
  path: string,
  options: FetchOptions = {},
  attempt = 1,
): Promise<T> {
  const { retries = 4, timeoutMs } = options;

  const response = await throttle(() =>
    fetch(`${API}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // We cache in Postgres ourselves; don't let Next.js cache responses
      // (a cached 503 would otherwise stick around).
      cache: "no-store",
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    }),
  );

  // 503 means MusicBrainz is busy or rate-limiting. Back off and retry.
  if (response.status === 503 && attempt <= retries) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return mbFetch<T>(path, options, attempt + 1);
  }

  // 404 = no such MBID; 400 = malformed MBID. Both arrive from a URL the
  // visitor typed or followed, so both mean "no such page" to them.
  if (response.status === 404 || response.status === 400) {
    throw new MbNotFoundError(`Not found in MusicBrainz: ${path}`);
  }

  if (!response.ok) {
    throw new Error(`MusicBrainz request failed (${response.status}): ${path}`);
  }

  return response.json() as Promise<T>;
}

export type MbCredit = {
  /** The name as printed on the release, which can differ from the artist's. */
  name?: string;
  joinphrase?: string;
  artist: { id: string; name: string };
};

export type MbRating = {
  /** Out of five. MULO doubles it. */
  value?: number;
  "votes-count"?: number;
};

export type MbArtist = {
  id: string;
  name: string;
  disambiguation?: string;
  /** Person, Group, Orchestra, Character and so on. */
  type?: string;
  country?: string;
  score?: number;
  aliases?: { name: string }[];
  relations?: { type: string; url?: { resource?: string } }[];
  rating?: MbRating;
};

export type MbReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  genres?: { name: string }[];
  "artist-credit"?: MbCredit[];
  score?: number;
  rating?: MbRating;
};

export type MbTrack = {
  position: number;
  title: string;
  length?: number;
  /** The song itself, shared by every release it appears on. */
  recording?: { id: string; title: string; length?: number };
};

/** One edition of an album, as listed before its tracks are fetched. */
type MbEdition = {
  id: string;
  status?: string;
  date?: string;
  country?: string;
  media?: { "track-count"?: number }[];
};

/**
 * How many people have to have voted on MusicBrainz before their score is
 * worth borrowing. A five out of five from one person is noise; a handful
 * agreeing is a signal.
 */
const MIN_SEED_VOTES = 3;

export type Seed = {
  /** Out of ten, to match MULO. */
  seed_score: number;
  seed_votes: number;
  seed_source: string;
};

/**
 * A starting score borrowed from MusicBrainz's own community, for things
 * nobody on MULO has rated yet. MusicBrainz scores out of five, so it is
 * doubled. Returns nulls when there is nothing worth borrowing, which clears
 * any stale seed on a row rather than leaving one behind.
 */
export function seedFrom(rating: MbRating | undefined): Seed | {
  seed_score: null;
  seed_votes: null;
  seed_source: "none";
} {
  const value = rating?.value;
  const votes = rating?.["votes-count"] ?? 0;

  if (typeof value !== "number" || value <= 0 || votes < MIN_SEED_VOTES) {
    // "none" rather than null records that we looked and there was nothing
    // worth borrowing, so the backfill script doesn't ask all over again.
    return { seed_score: null, seed_votes: null, seed_source: "none" };
  }

  return {
    // Clamped because MULO's scale starts at one, and rounded to the one
    // decimal place every score on the site is shown to.
    seed_score: Math.min(10, Math.max(1, Math.round(value * 2 * 10) / 10)),
    seed_votes: votes,
    seed_source: "musicbrainz",
  };
}

/** The artist credit as printed on a release, e.g. "JAY-Z & Kanye West". */
export function creditText(credit: MbCredit[] = []): string | null {
  return (
    credit
      .map((c) => `${c.name ?? c.artist.name}${c.joinphrase ?? ""}`)
      .join("")
      .trim() || null
  );
}

/**
 * Search is somebody waiting at a text box, so it gets one quick try. From
 * Vercel's shared servers MusicBrainz often answers "busy", and retrying with
 * back-off held the search page open for 25 seconds.
 */
const SEARCH: FetchOptions = { retries: 0, timeoutMs: 4000 };
const SEARCH_DEADLINE_MS = 5000;

/** Also counts time spent queued behind other MusicBrainz requests. */
function withDeadline<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("MusicBrainz took too long")),
        SEARCH_DEADLINE_MS,
      ),
    ),
  ]);
}

/**
 * People who share a name with a musician. MusicBrainz carries actors,
 * authors and footballers because they turn up on soundtracks and audiobooks,
 * and a plain text search can't tell them from the artist being looked for.
 */
const NOT_A_MUSICIAN =
  /\bactress|\bactor\b|voice actor|author\b|writer\b|novelist|footballer|presenter|comedian|politician|journalist|narrator/i;

/**
 * MusicBrainz ranks artists purely on how closely the text matches, with no
 * notion of who anybody is. Searching "Fisher" put a trance singer, an
 * actress, a fifties crooner and a pop duo above the house producer almost
 * everybody means — they all match the word equally well.
 *
 * Nudging exact matches up and non-musicians down doesn't make it clever, but
 * it puts the likely answer where somebody will actually see it.
 */
function artistRelevance(artist: MbArtist, query: string) {
  const q = query.toLowerCase().trim();
  const name = artist.name.toLowerCase();
  const about = artist.disambiguation ?? "";

  let boost = 0;
  if (name === q) boost += 300;
  else if (name.startsWith(q)) boost += 120;

  if (NOT_A_MUSICIAN.test(about)) boost -= 400;
  // A group or a person is more likely to be who somebody means than a
  // character, an orchestra credit or some other odd entry.
  if (artist.type === "Person" || artist.type === "Group") boost += 40;

  return boost + (artist.score ?? 0);
}

export async function searchArtists(query: string): Promise<MbArtist[]> {
  const data = await withDeadline(
    mbFetch<{ artists: MbArtist[] }>(
      `/artist?query=${encodeURIComponent(query)}&limit=20&fmt=json`,
      SEARCH,
    ),
  );
  return (data.artists ?? []).sort(
    (a, b) => artistRelevance(b, query) - artistRelevance(a, query),
  );
}

/** Escape characters that would otherwise be Lucene query syntax. */
function escapeLucene(value: string) {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

/** Tribute, karaoke and novelty acts nobody is searching for. */
const NOVELTY = /tribute|karaoke|cover band|8-bit|8 bit|lullaby|renditions|string quartet|piano tribute|made famous by/i;

/**
 * MusicBrainz ranks purely on text similarity with no notion of popularity,
 * so a plain search buries famous albums under obscure ones. Nudge results
 * that match the artist or title closely towards the top.
 */
function relevance(group: MbReleaseGroup, query: string) {
  const q = query.toLowerCase().trim();
  const title = group.title.toLowerCase();
  const artist = (
    group["artist-credit"]?.[0]?.artist.name ?? ""
  ).toLowerCase();

  let boost = 0;
  if (NOVELTY.test(artist) || NOVELTY.test(title)) boost -= 500;
  if (artist === q) boost += 400;
  else if (artist.startsWith(q)) boost += 250;
  else if (artist.includes(q)) boost += 120;

  if (title === q) boost += 300;
  else if (title.startsWith(q)) boost += 150;

  // Entries with no release date are usually incomplete stubs.
  if (group["first-release-date"]) boost += 20;

  return boost + (group.score ?? 0);
}

export async function searchReleaseGroups(
  query: string,
): Promise<MbReleaseGroup[]> {
  // Match the query against either the artist or the album title, and ask
  // only for albums so singles and EPs don't crowd out real records.
  const escaped = escapeLucene(query);
  const lucene = `(artist:(${escaped}) OR releasegroup:(${escaped})) AND primarytype:Album`;

  const data = await withDeadline(
    mbFetch<{ "release-groups": MbReleaseGroup[] }>(
      `/release-group?query=${encodeURIComponent(lucene)}&limit=100&fmt=json`,
      SEARCH,
    ),
  );

  return (data["release-groups"] ?? [])
    .filter((g) => (g["secondary-types"] ?? []).length === 0)
    .sort((a, b) => relevance(b, query) - relevance(a, query))
    .slice(0, 20);
}

export async function getArtist(mbid: string): Promise<MbArtist> {
  return mbFetch<MbArtist>(`/artist/${mbid}?inc=url-rels+aliases+ratings&fmt=json`);
}

/**
 * MusicBrainz records a Wikidata link for most notable artists, which is the
 * way through to a photo and a real biography.
 */
export function wikidataQid(artist: MbArtist): string | null {
  const url = artist.relations?.find((r) => r.type === "wikidata")?.url
    ?.resource;
  if (!url) return null;

  const qid = url.split("/").pop();
  return qid && /^Q\d+$/.test(qid) ? qid : null;
}

const MAX_ALBUM_PAGES = 3;

/**
 * An artist's studio albums, following further pages for prolific artists.
 * MusicBrainz lumps live albums, bootlegs, compilations and interviews in
 * with studio albums; anything carrying a secondary type isn't what people
 * mean by "an album", so those are dropped.
 */
export async function getArtistReleaseGroups(
  mbid: string,
): Promise<MbReleaseGroup[]> {
  const albums: MbReleaseGroup[] = [];

  for (let page = 0; page < MAX_ALBUM_PAGES; page++) {
    const offset = page * 100;
    const data = await mbFetch<{
      "release-groups": MbReleaseGroup[];
      "release-group-count"?: number;
    }>(
      `/release-group?artist=${mbid}&type=album&inc=artist-credits&limit=100&offset=${offset}&fmt=json`,
    );

    const groups = data["release-groups"] ?? [];
    albums.push(
      ...groups.filter((g) => (g["secondary-types"] ?? []).length === 0),
    );

    if (groups.length < 100 || offset + 100 >= (data["release-group-count"] ?? 0)) {
      break;
    }
  }

  return albums;
}

export async function getReleaseGroup(mbid: string): Promise<MbReleaseGroup> {
  return mbFetch<MbReleaseGroup>(
    `/release-group/${mbid}?inc=artists+genres+ratings&fmt=json`,
  );
}

function trackCount(edition: MbEdition) {
  return (edition.media ?? []).reduce((sum, m) => sum + (m["track-count"] ?? 0), 0);
}

// Worldwide and big English-language releases carry the titles people know.
const PREFERRED_COUNTRIES = ["XW", "US", "GB", "XE", "CA", "AU"];

/**
 * An album comes in many editions: deluxe versions with bonus tracks, promo
 * samplers, pressings for different countries. The standard edition is the
 * one released most often, so take the most common official track count,
 * then the best-placed, earliest release with that count.
 */
function standardEdition(editions: MbEdition[]): MbEdition | null {
  const usable = editions.filter((e) => trackCount(e) > 0);
  const official = usable.filter((e) => e.status === "Official");
  const pool = official.length > 0 ? official : usable;

  const byCount = new Map<number, MbEdition[]>();
  for (const edition of pool) {
    const count = trackCount(edition);
    byCount.set(count, [...(byCount.get(count) ?? []), edition]);
  }

  const date = (e: MbEdition) => e.date || "9999";
  const earliest = (group: MbEdition[]) => group.map(date).sort()[0];
  const groups = [...byCount.values()].sort(
    (a, b) => b.length - a.length || earliest(a).localeCompare(earliest(b)),
  );

  const place = (e: MbEdition) => {
    const index = PREFERRED_COUNTRIES.indexOf(e.country ?? "");
    return index === -1 ? PREFERRED_COUNTRIES.length : index;
  };

  return (
    (groups[0] ?? []).sort(
      (a, b) => place(a) - place(b) || date(a).localeCompare(date(b)),
    )[0] ?? null
  );
}

/**
 * The tracklist of an album's standard edition, each track carrying the id
 * of its song. Two requests: the album's editions, then the chosen one.
 */
export async function getTracklist(
  releaseGroupMbid: string,
): Promise<MbTrack[]> {
  const { releases = [] } = await mbFetch<{ releases?: MbEdition[] }>(
    `/release?release-group=${releaseGroupMbid}&inc=media&limit=100&fmt=json`,
  );

  const edition = standardEdition(releases);
  if (!edition) return [];

  const { media = [] } = await mbFetch<{ media?: { tracks?: MbTrack[] }[] }>(
    `/release/${edition.id}?inc=recordings&fmt=json`,
  );
  return media.flatMap((m) => m.tracks ?? []);
}

export function coverArtUrl(releaseGroupMbid: string) {
  return `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-500`;
}
