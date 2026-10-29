import "server-only";

/**
 * ListenBrainz's metadata lookups: names to a recording and its release in
 * bulk (with the website's token), then each recording's album (release
 * group). Much faster than MusicBrainz's one search a second.
 */

const API = "https://api.listenbrainz.org/1/metadata";
/** MAX_LOOKUPS_PER_POST in ListenBrainz's metadata_api.py. */
const LOOKUPS_PER_POST = 50;
/**
 * MAX_ITEMS_PER_GET in ListenBrainz's api_tools.py is 1,000 (checked
 * 2026-10-30); a hundred keeps each answer small.
 */
const GROUPS_CHUNK = 100;
/** MAX_MAPPING_QUERY_LENGTH: the three names together, in characters. */
const QUERY_MAX = 250;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const listenbrainzToken = () => process.env.LISTENBRAINZ_TOKEN || null;

export type LookupItem = { artist: string; album: string; song: string };
export type LookupHit = { recording: string; releaseName: string | null };
export type Group = { group: string; title: string; artist: string | null };

/**
 * Three names cut so together they fit ListenBrainz's limit: short ones keep
 * every character, and the long ones share what's left. Cut by character, as
 * ListenBrainz counts, so nothing is split in half.
 */
function fit(item: LookupItem) {
  const names = [item.artist, item.song, item.album].map((name) => Array.from(name));
  const sizes = names.map((name) => name.length);
  let room = QUERY_MAX;
  const order = [0, 1, 2].sort((a, b) => sizes[a]! - sizes[b]!);
  const keep = [0, 0, 0];
  order.forEach((index, position) => {
    keep[index] = Math.min(sizes[index]!, Math.floor(room / (order.length - position)));
    room -= keep[index]!;
  });
  const [artist, song, album] = names.map((name, index) => name.slice(0, keep[index]).join(""));
  return { artist_name: artist!, recording_name: song!, release_name: album! };
}

async function post<T>(path: string, body: unknown, fetcher: Fetcher, token?: string): Promise<T> {
  const response = await fetcher(`${API}/${path}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "MULO/0.1 ( https://getmulo.com )",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ListenBrainz answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}

/**
 * Each item's recording, in order; null where nothing matched. An item
 * without an artist or a song isn't sent, as one would fail its whole batch.
 */
export async function lookupRecordings(
  items: LookupItem[],
  token: string,
  fetcher: Fetcher = fetch,
): Promise<(LookupHit | null)[]> {
  const hits: (LookupHit | null)[] = items.map(() => null);
  const asked = items.flatMap((item, index) =>
    item.artist.trim() && item.song.trim() ? [{ item, index }] : [],
  );
  for (let i = 0; i < asked.length; i += LOOKUPS_PER_POST) {
    const chunk = asked.slice(i, i + LOOKUPS_PER_POST);
    const answer = await post<{ index?: number; recording_mbid?: string; release_name?: string }[]>(
      "lookup",
      { recordings: chunk.map(({ item }) => fit(item)) },
      fetcher,
      token,
    );
    const byIndex = new Map(answer.map((row, position) => [row.index ?? position, row]));
    chunk.forEach(({ index }, position) => {
      const row = byIndex.get(position);
      if (row?.recording_mbid) {
        hits[index] = { recording: row.recording_mbid, releaseName: row.release_name ?? null };
      }
    });
  }
  return hits;
}

/** Each recording's album, where ListenBrainz knows it. */
export async function groupsOf(
  recordings: string[],
  fetcher: Fetcher = fetch,
): Promise<Map<string, Group>> {
  const groups = new Map<string, Group>();
  for (let i = 0; i < recordings.length; i += GROUPS_CHUNK) {
    const answer = await post<
      Record<
        string,
        { release?: { release_group_mbid?: string; name?: string; album_artist_name?: string } }
      >
    >(
      "recording",
      { recording_mbids: recordings.slice(i, i + GROUPS_CHUNK), inc: "release" },
      fetcher,
    );
    for (const [recording, data] of Object.entries(answer)) {
      const release = data.release;
      if (release?.release_group_mbid && release.name) {
        groups.set(recording, {
          group: release.release_group_mbid,
          title: release.name,
          artist: release.album_artist_name ?? null,
        });
      }
    }
  }
  return groups;
}
