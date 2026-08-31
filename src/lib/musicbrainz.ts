const API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "MULO/0.1 (alexbacskos@gmail.com)";
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

async function mbFetch<T>(path: string, attempt = 1): Promise<T> {
  const response = await throttle(() =>
    fetch(`${API}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // We cache in Postgres ourselves; don't let Next.js cache responses
      // (a cached 503 would otherwise stick around).
      cache: "no-store",
    }),
  );

  // 503 means MusicBrainz is busy or rate-limiting. Back off and retry.
  if (response.status === 503 && attempt <= 4) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return mbFetch<T>(path, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`MusicBrainz request failed (${response.status}): ${path}`);
  }

  return response.json() as Promise<T>;
}

export type MbArtist = {
  id: string;
  name: string;
  disambiguation?: string;
  country?: string;
};

export type MbReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  genres?: { name: string }[];
  "artist-credit"?: { artist: { id: string; name: string } }[];
};

export type MbTrack = {
  position: number;
  title: string;
  length?: number;
};

export async function searchArtists(query: string): Promise<MbArtist[]> {
  const data = await mbFetch<{ artists: MbArtist[] }>(
    `/artist?query=${encodeURIComponent(query)}&limit=20&fmt=json`,
  );
  return data.artists ?? [];
}

export async function searchReleaseGroups(
  query: string,
): Promise<MbReleaseGroup[]> {
  const data = await mbFetch<{ "release-groups": MbReleaseGroup[] }>(
    `/release-group?query=${encodeURIComponent(query)}&limit=20&fmt=json`,
  );
  return data["release-groups"] ?? [];
}

export async function getArtist(mbid: string): Promise<MbArtist> {
  return mbFetch<MbArtist>(`/artist/${mbid}?fmt=json`);
}

export async function getArtistReleaseGroups(
  mbid: string,
): Promise<MbReleaseGroup[]> {
  const data = await mbFetch<{ "release-groups": MbReleaseGroup[] }>(
    `/release-group?artist=${mbid}&type=album&limit=100&fmt=json`,
  );
  const groups = data["release-groups"] ?? [];

  // MusicBrainz lumps live albums, bootlegs, compilations and interviews in
  // with studio albums. Anything carrying a secondary type isn't what people
  // mean by "an album", so drop those.
  return groups.filter((g) => (g["secondary-types"] ?? []).length === 0);
}

export async function getReleaseGroup(mbid: string): Promise<MbReleaseGroup> {
  return mbFetch<MbReleaseGroup>(
    `/release-group/${mbid}?inc=artists+genres&fmt=json`,
  );
}

export async function getTracklist(
  releaseGroupMbid: string,
): Promise<MbTrack[]> {
  const data = await mbFetch<{
    releases: { media: { tracks: MbTrack[] }[] }[];
  }>(
    `/release?release-group=${releaseGroupMbid}&inc=recordings&limit=1&fmt=json`,
  );

  const media = data.releases?.[0]?.media ?? [];
  return media.flatMap((m) => m.tracks ?? []);
}

export function coverArtUrl(releaseGroupMbid: string) {
  return `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-500`;
}
