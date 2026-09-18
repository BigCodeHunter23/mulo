/**
 * Thirty-second song previews from Apple's public search, played in the
 * browser.
 *
 * Apple allows previews on a page that promotes the music, streamed and never
 * stored, with a credit and a way through to Apple Music beside them, so every
 * player shows both. Deezer was the first idea, but its terms rule out any
 * commercial use at all.
 *
 * The lookup runs in the browser rather than on the server: Apple allows each
 * address about twenty searches a minute, which one person tapping play never
 * reaches but Vercel's shared addresses would. Nothing happens until someone
 * taps play, and each answer is remembered for the rest of the visit.
 */

export type Preview = {
  /** The thirty-second clip. */
  audio: string;
  /** The song on Apple Music, which Apple asks to sit beside the player. */
  link: string;
};

const SEARCH = "https://itunes.apple.com/search";
const TIMEOUT_MS = 5000;

/** Versions nobody means when they ask for the song itself. */
const ALTERNATE = /\b(instrumental|karaoke|acapella|a cappella|live|remix|demo|cover|lullaby)\b/;

const found = new Map<string, Promise<Preview | null>>();

/** Lowercase, no accents, no "(feat. …)" or "[Remastered]", letters and digits only. */
function normalise(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/\s(feat|ft)\.?\s.*$/, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Result = {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

function pick(results: Result[], artist: string, title: string): Preview | null {
  const wantArtist = normalise(artist);
  const wantTitle = normalise(title);
  const wantsAlternate = ALTERNATE.test(wantTitle);

  let best: { preview: Preview; rank: number } | null = null;
  for (const result of results) {
    if (!result.previewUrl || !result.trackViewUrl || !result.trackName) continue;
    const theirArtist = normalise(result.artistName ?? "");
    if (!theirArtist.includes(wantArtist) && !wantArtist.includes(theirArtist)) continue;

    const theirTitle = normalise(result.trackName);
    if (!wantsAlternate && ALTERNATE.test(result.trackName.toLowerCase())) continue;
    const rank = theirTitle === wantTitle ? 0 : theirTitle.startsWith(wantTitle) ? 1 : -1;
    if (rank < 0) continue;

    if (!best || rank < best.rank) {
      best = { preview: { audio: result.previewUrl, link: result.trackViewUrl }, rank };
    }
  }
  return best?.preview ?? null;
}

async function search(artist: string, title: string): Promise<Preview | null> {
  const url = new URL(SEARCH);
  url.searchParams.set("term", `${artist} ${title}`);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "15");
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Apple search ${response.status}`);
  const body = (await response.json()) as { results?: Result[] };
  return pick(body.results ?? [], artist, title);
}

/** The preview for one song, or null when Apple has no clear match. */
export function findPreview(artist: string, title: string): Promise<Preview | null> {
  const key = `${normalise(artist)}|${normalise(title)}`;
  let pending = found.get(key);
  if (!pending) {
    pending = search(artist, title).catch(() => {
      // A failed lookup is worth trying again later; a clean "no match" isn't.
      found.delete(key);
      return null;
    });
    found.set(key, pending);
  }
  return pending;
}
