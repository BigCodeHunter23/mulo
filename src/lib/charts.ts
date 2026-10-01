import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { SHARED_CACHE_SECONDS } from "@/lib/cache-times";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { GENRE_FAMILIES } from "@/lib/badge-catalog";
import { getArtistGenres } from "@/lib/artist-genres";
import type { RatingTable } from "@/lib/rating-kinds";
import { logQueryError } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";

/**
 * The Charts: MULO's all-time rankings, for albums, songs and artists, over
 * everything or inside one genre.
 *
 * The hard part of a chart is not the sorting, it's stopping a record with
 * three tens from sitting above a record with four hundred nines. A plain
 * average can't tell a great record from a lucky one. So the ordering uses a
 * weighted average, the same shape IMDb uses for its Top 250:
 *
 *   rank = (v / (v + m)) * R  +  (m / (v + m)) * C
 *
 * R is the record's own average, v is how many people rated it, C is the
 * average across everything on MULO, and m is how many ratings it takes to be
 * trusted on its own. A record with few ratings is pulled towards the middle
 * of the site; as ratings pile up it earns its own score back. Nothing is
 * excluded and nothing is cut at a hard threshold — records climb as the
 * crowd backs them.
 *
 * The displayed score stays the honest plain average. Only the ordering uses
 * the weighting, so nobody is shown a number that isn't theirs.
 */

export type ChartKind = "albums" | "songs" | "artists";

export const CHART_KINDS: { id: ChartKind; label: string; noun: string }[] = [
  { id: "albums", label: "Albums", noun: "album" },
  { id: "songs", label: "Songs", noun: "song" },
  { id: "artists", label: "Artists", noun: "artist" },
];

/**
 * How many ratings a record needs before its own average carries full weight.
 * Deliberately low while MULO is small: with a few hundred people, demanding
 * twenty-five ratings would leave the chart empty. Raise it as the crowd grows.
 */
const CONFIDENCE: Record<ChartKind, number> = {
  albums: 3,
  songs: 3,
  artists: 3,
};

/** The fallback middle when the site has nothing to average yet. */
const NEUTRAL = 6.5;

export type ChartEntry = {
  rank: number;
  mbid: string;
  title: string;
  /** The artist line, absent on an artist chart. */
  subtitle: string | null;
  /** The artist's own mbid, so a song or album row can link onward. */
  artistMbid: string | null;
  coverUrl: string | null;
  year: string | null;
  /** The plain average, which is what gets shown. */
  average: number;
  /** How many people rated it. */
  votes: number;
  /** The weighted score the ordering used. */
  weighted: number;
  /** Where the row points. */
  href: string;
};

export type Chart = {
  kind: ChartKind;
  /** The genre family id, or null for everything. */
  genre: string | null;
  genreName: string | null;
  entries: ChartEntry[];
  /** How many rated things were in the running before the cut. */
  pool: number;
  /** The site-wide average the weighting pulled towards. */
  siteAverage: number;
};

/** The genres a chart can be filtered to, reusing the badge ladders' families. */
export const CHART_GENRES = GENRE_FAMILIES.map((family) => ({
  id: family.id,
  name: family.name,
}));

export function genreName(id: string | null): string | null {
  if (!id) return null;
  return GENRE_FAMILIES.find((family) => family.id === id)?.name ?? null;
}

export function isChartKind(value: string): value is ChartKind {
  return CHART_KINDS.some((kind) => kind.id === value);
}

type Tally = { sum: number; votes: number };

/** A chart function's row with its totals present, which they always are. */
function tallied<Row extends { mbid: string | null; total: number | null; votes: number | null }>(
  rows: Row[],
): (Row & { mbid: string; tally: Tally })[] {
  return rows.flatMap((row) =>
    row.mbid && row.total !== null && row.votes
      ? [{ ...row, mbid: row.mbid, tally: { sum: row.total, votes: row.votes } }]
      : [],
  );
}

/** The average across every rating on MULO — the middle a thin record sinks to. */
function siteMean(tallies: Tally[]): number {
  let sum = 0;
  let votes = 0;
  for (const t of tallies) {
    sum += t.sum;
    votes += t.votes;
  }
  return votes === 0 ? NEUTRAL : sum / votes;
}

/**
 * The chart functions (migration 0018) return one row per rated thing with
 * its totals, counted by the database. They're read a page at a time, since
 * there can be more rated things than the API returns at once.
 */
function logged<Row>(result: { data: Row[]; error: { message: string; code?: string } | null }): Row[] {
  if (result.error) {
    logQueryError("charts", result.error, "0018");
    // Thrown rather than charted as empty, so a failed read is never cached.
    throw new Error(result.error.message);
  }
  return result.data;
}

function weigh(t: Tally, site: number, confidence: number) {
  const average = t.sum / t.votes;
  return {
    average,
    votes: t.votes,
    weighted: (t.votes * average + confidence * site) / (t.votes + confidence),
  };
}

function yearOf(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

type Client = ReturnType<typeof createPublicClient>;

/**
 * Genre charts are strict: an album or song appears under its artist's main
 * genre and no other, so Kendrick Lamar isn't in pop because one of his
 * albums is tagged "pop rap". See main-genre.ts and artist-genres.ts.
 */
function inGenre(
  main: Map<string, string | null>,
  artistMbid: string | null | undefined,
  family: string | null,
): boolean {
  if (!family) return true;
  return Boolean(artistMbid) && main.get(artistMbid!) === family;
}

/**
 * One chart, ready to render. The database counts each rated thing's votes
 * (fetching raw ratings was cut off at a thousand rows); the weighting stays
 * here, in one readable place instead of buried in a database function.
 */
async function buildChart(kind: ChartKind, genre: string | null, limit: number): Promise<Chart> {
  const supabase = createPublicClient();

  if (kind === "albums") return albumChart(supabase, genre, limit);
  if (kind === "songs") return songChart(supabase, genre, limit);
  return artistChart(supabase, genre, limit);
}

/**
 * A chart is the same for everybody and moves slowly, so each one is kept
 * for a few minutes and shared across visitors rather than recounted on
 * every view. A new rating shows up in it within that time.
 */
const cachedChart = unstable_cache(buildChart, ["chart"], { revalidate: SHARED_CACHE_SECONDS });

export async function getChart(
  kind: ChartKind,
  options: { genre?: string | null; limit?: number } = {},
): Promise<Chart> {
  const genre = options.genre ?? null;
  try {
    return await cachedChart(kind, genre, options.limit ?? 100);
  } catch {
    // Already logged; the page shows an empty chart, as it did before.
    return blank(kind, genre, NEUTRAL);
  }
}

async function albumChart(
  supabase: Client,
  genre: string | null,
  limit: number,
): Promise<Chart> {
  const rows = tallied(
    logged(
      await readAll((from, to) => supabase.rpc("album_chart_rows").order("mbid").range(from, to)),
    ),
  );
  const site = siteMean(rows.map((row) => row.tally));
  if (rows.length === 0) return blank("albums", genre, site);

  const main = genre
    ? await getArtistGenres()
    : new Map<string, string | null>();

  const scored = rows
    .filter((row) => inGenre(main, row.artist_mbid, genre))
    .map((row) => ({
      ...weigh(row.tally, site, CONFIDENCE.albums),
      mbid: row.mbid,
      title: row.title ?? "",
      subtitle: row.artist_name,
      artistMbid: row.artist_mbid,
      coverUrl: row.cover_art_url,
      year: yearOf(row.release_date),
      href: `/album/${row.mbid}`,
    }));

  return finish("albums", genre, scored, site, limit);
}

async function songChart(
  supabase: Client,
  genre: string | null,
  limit: number,
): Promise<Chart> {
  // A song carries no genre of its own. It borrows the album it was first
  // rated on, which is also where its cover and artist line come from.
  const rows = tallied(
    logged(
      await readAll((from, to) => supabase.rpc("song_chart_rows").order("mbid").range(from, to)),
    ),
  );
  const site = siteMean(rows.map((row) => row.tally));
  if (rows.length === 0) return blank("songs", genre, site);

  const main = genre
    ? await getArtistGenres()
    : new Map<string, string | null>();

  const scored = rows
    .filter((row) => inGenre(main, row.artist_mbid, genre))
    .map((row) => ({
      ...weigh(row.tally, site, CONFIDENCE.songs),
      mbid: row.mbid,
      title: row.title ?? "",
      subtitle: row.artist_name,
      artistMbid: row.artist_mbid,
      coverUrl: row.cover_art_url,
      year: yearOf(row.release_date),
      // Songs have no page of their own: a song row opens its album.
      href: `/album/${row.release_mbid}`,
    }));

  return finish("songs", genre, scored, site, limit);
}

async function artistChart(
  supabase: Client,
  genre: string | null,
  limit: number,
): Promise<Chart> {
  // An artist carries no genre tags of their own: their main genre is worked
  // out from whatever their records are tagged with.
  const [result, main] = await Promise.all([
    readAll((from, to) => supabase.rpc("artist_chart_rows").order("mbid").range(from, to)),
    genre ? getArtistGenres() : Promise.resolve(new Map<string, string | null>()),
  ]);
  const rows = tallied(logged(result));
  const site = siteMean(rows.map((row) => row.tally));
  if (rows.length === 0) return blank("artists", genre, site);

  const scored = rows
    .filter((row) => inGenre(main, row.mbid, genre))
    .map((row) => ({
      ...weigh(row.tally, site, CONFIDENCE.artists),
      mbid: row.mbid,
      title: row.name ?? "",
      subtitle: null,
      artistMbid: row.mbid,
      coverUrl: row.image_url,
      year: null,
      href: `/artist/${row.mbid}`,
    }));

  return finish("artists", genre, scored, site, limit);
}

type Scored = Omit<ChartEntry, "rank">;

function finish(
  kind: ChartKind,
  genre: string | null,
  scored: Scored[],
  site: number,
  limit: number,
): Chart {
  const entries = scored
    .sort((a, b) => b.weighted - a.weighted || b.votes - a.votes)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return {
    kind,
    genre,
    genreName: genreName(genre),
    entries,
    pool: scored.length,
    siteAverage: site,
  };
}

function blank(kind: ChartKind, genre: string | null, site: number): Chart {
  return {
    kind,
    genre,
    genreName: genreName(genre),
    entries: [],
    pool: 0,
    siteAverage: site,
  };
}

/**
 * Which of a chart's entries the signed-in person has already rated, and what
 * they gave each one.
 *
 * This is the reason to scroll a chart at all. A hundred albums is a list; a
 * hundred albums with thirty of them ticked off is a scoreboard, and the gaps
 * are an invitation. Signed out it's simply empty and the chart renders plain.
 */
export type ChartProgress = {
  /** Entry mbid to the score this person gave it. */
  yours: Map<string, number>;
  rated: number;
  total: number;
};

const PROGRESS_COLUMNS: Record<ChartKind, { table: RatingTable; column: string }> = {
  albums: { table: "ratings", column: "release_mbid" },
  songs: { table: "song_ratings", column: "song_mbid" },
  artists: { table: "artist_ratings", column: "artist_mbid" },
};

export async function getChartProgress(chart: Chart): Promise<ChartProgress> {
  const empty: ChartProgress = {
    yours: new Map(),
    rated: 0,
    total: chart.entries.length,
  };
  if (chart.entries.length === 0) return empty;

  const user = await getCurrentUser();
  if (!user) return empty;

  const { table, column } = PROGRESS_COLUMNS[chart.kind];
  const supabase = await createClient();

  const { data } = await supabase
    .from(table)
    .select(`${column}, score`)
    .eq("user_id", user.id)
    .in(
      column,
      chart.entries.map((entry) => entry.mbid),
    );

  const yours = new Map<string, number>();
  for (const row of (data ?? []) as unknown as Record<string, string | number>[]) {
    yours.set(String(row[column]), Number(row.score));
  }

  return { yours, rated: yours.size, total: chart.entries.length };
}
