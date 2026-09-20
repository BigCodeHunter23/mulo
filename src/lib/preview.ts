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
const LOOKUP = "https://itunes.apple.com/lookup";
const TIMEOUT_MS = 5000;

/** Versions nobody means when they ask for the song itself. */
const ALTERNATE = /\b(instrumental|karaoke|acapella|a cappella|live|remix|demo|cover|lullaby)\b/;

const found = new Map<string, Promise<Preview | null>>();
/** Songs Apple had nothing for. Not every record is on Apple Music. */
const missing = new Set<string>();
/** One album's songs, keyed by cleaned title, looked up once per album. */
const albums = new Map<string, Promise<Map<string, Preview>>>();
/** One artist's records on Apple, so a second album by them is free. */
const discographies = new Map<string, Promise<AlbumResult[]>>();

/** Lowercase, no accents, no "(feat. …)" or "[Remastered]", letters and digits only. */
function normalise(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/\s(feat|ft)\.?\s.*$/, " ")
    .replace(/&/g, "and")
    // Apple stars out explicit words. Dropping the stars rather than turning
    // them into spaces keeps "F**kin'" one word, so it can still be lined up
    // against "Fuckin'" below.
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether two words are the same word with one of them censored: same ends,
 * and the censored one shorter by the handful of letters that got starred.
 */
function censoredPair(a: string, b: string) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2 || long.length - short.length > 4) return false;
  return short[0] === long[0] && short[short.length - 1] === long[long.length - 1];
}

/** The same title with a word starred out, as Apple writes explicit songs. */
function sameSong(theirs: string, ours: string) {
  const mine = ours.split(" ");
  const yours = theirs.split(" ");
  if (mine.length !== yours.length || mine.length === 0) return false;

  let exact = 0;
  for (let i = 0; i < mine.length; i++) {
    if (mine[i] === yours[i]) {
      exact++;
      continue;
    }
    if (!censoredPair(mine[i], yours[i])) return false;
  }
  // At least half has to line up exactly, so two short near-misses can't pass.
  return exact * 2 >= mine.length;
}

/**
 * The form used both to ask Apple and to compare what comes back. Cleaning
 * leaves nothing at all for a title written in another script, so fall back to
 * the plain text there: an empty string would otherwise match every result.
 */
function plain(text: string) {
  return normalise(text) || text.toLowerCase().trim();
}

type Result = {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

type AlbumResult = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  trackCount?: number;
};

type SongResult = Result & {
  collectionId?: number;
  collectionName?: string;
};

/** Two names for the same thing, allowing for a suffix on either side. */
function sameName(theirs: string, ours: string) {
  if (!theirs || !ours) return false;
  return theirs === ours || theirs.startsWith(ours) || ours.startsWith(theirs);
}

function pick(results: Result[], artist: string, title: string): Preview | null {
  const wantArtist = plain(artist);
  const wantTitle = plain(title);
  const wantsAlternate = ALTERNATE.test(wantTitle);

  let best: { preview: Preview; rank: number } | null = null;
  for (const result of results) {
    if (!result.previewUrl || !result.trackViewUrl || !result.trackName) continue;
    const theirArtist = plain(result.artistName ?? "");
    if (!theirArtist.includes(wantArtist) && !wantArtist.includes(theirArtist)) continue;

    const theirTitle = plain(result.trackName);
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
  // Ask in the cleaned form. A cached edition can carry a title Apple has
  // never heard of — "On Time (ChoppedNotSlopped)" finds nothing at all,
  // where "on time" finds the song — and the comparison below is the
  // safeguard against the looser search that produces.
  url.searchParams.set("term", `${plain(artist)} ${plain(title)}`.trim());
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "15");
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Apple search ${response.status}`);
  const body = (await response.json()) as { results?: Result[] };
  return pick(body.results ?? [], artist, title);
}

/**
 * Every song on one album, in one pair of calls.
 *
 * Far better than searching song by song: Apple's song search ranks on
 * popularity, so asking for "mac miller self care" answers with his biggest
 * tracks and never returns Self Care at all. The album's own tracklist has no
 * such problem, and it costs two requests for a whole record instead of one
 * per song, which matters against Apple's limit of about twenty a minute.
 */
/**
 * Every record an artist has on Apple, by their id.
 *
 * Apple's album search is unreliable in a way that bites hard: searching
 * A$AP Rocky and LONG.LIVE.A$AP never returns LONG.LIVE.A$AP, though Apple
 * plainly has it. Their discography does return it, along with Don't Be Dumb
 * and LIVE.LOVE.A$AP, which the search also misses. One lookup covers every
 * record by that artist, so browsing several of them costs nothing more.
 */
async function discography(artist: string): Promise<AlbumResult[]> {
  const wantArtist = plain(artist);

  const search = new URL(SEARCH);
  search.searchParams.set("term", wantArtist);
  search.searchParams.set("entity", "musicArtist");
  search.searchParams.set("limit", "10");
  const response = await fetch(search, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return [];
  const body = (await response.json()) as { results?: { artistId?: number; artistName?: string }[] };

  const people = body.results ?? [];
  // Exact first: "drake" would otherwise settle for "drake bell".
  const person =
    people.find((p) => p.artistId && plain(p.artistName ?? "") === wantArtist) ??
    people.find((p) => p.artistId && sameName(plain(p.artistName ?? ""), wantArtist));
  if (!person?.artistId) return [];

  const listing = new URL(LOOKUP);
  listing.searchParams.set("id", String(person.artistId));
  listing.searchParams.set("entity", "album");
  listing.searchParams.set("limit", "200");
  const second = await fetch(listing, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!second.ok) return [];
  const albums = (await second.json()) as { results?: AlbumResult[] };
  return (albums.results ?? []).filter((a) => a.collectionId && a.collectionName);
}

function artistAlbums(artist: string) {
  const key = plain(artist);
  let pending = discographies.get(key);
  if (!pending) {
    pending = discography(artist).catch(() => {
      discographies.delete(key);
      return [] as AlbumResult[];
    });
    discographies.set(key, pending);
  }
  return pending;
}

/**
 * The best entry for one record: the fullest edition of it.
 *
 * Apple lists the same album several times — standard, deluxe, explicit and
 * clean, one per region. The longest tracklist is the one to take: MULO's
 * LONG.LIVE.A$AP has sixteen songs and Apple's standard edition has twelve,
 * so the deluxe is the only one that can answer for Jodye or Angels. Extra
 * songs on it cost nothing, since only the ones being asked for get used.
 */
function pickEdition(albums: AlbumResult[], wantAlbum: string) {
  const matching = albums.filter((a) => sameName(plain(a.collectionName ?? ""), wantAlbum));
  if (matching.length === 0) return null;

  return matching.sort((a, b) => {
    const size = (b.trackCount ?? 0) - (a.trackCount ?? 0);
    if (size !== 0) return size;
    // A tie goes to the one actually called what we asked for.
    const exactA = plain(a.collectionName ?? "") === wantAlbum ? 0 : 1;
    const exactB = plain(b.collectionName ?? "") === wantAlbum ? 0 : 1;
    return exactA - exactB;
  })[0];
}

async function albumId(artist: string, album: string, anchor?: string) {
  const wantArtist = plain(artist);
  const wantAlbum = plain(album);

  const mine = pickEdition(await artistAlbums(artist), wantAlbum);
  if (mine?.collectionId) return mine.collectionId;

  const url = new URL(SEARCH);
  url.searchParams.set("term", `${wantArtist} ${wantAlbum}`.trim());
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "8");
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Apple album search ${response.status}`);
  const body = (await response.json()) as { results?: AlbumResult[] };

  // Both have to match: searching an artist and a record still answers with
  // their other records, so taking the first hit lands on the wrong album.
  const hit = (body.results ?? []).find(
    (result) =>
      result.collectionId &&
      sameName(plain(result.artistName ?? ""), wantArtist) &&
      sameName(plain(result.collectionName ?? ""), wantAlbum),
  );
  if (hit?.collectionId) return hit.collectionId;

  // Apple's album index has holes — Mac Miller's Swimming is on Apple Music but
  // an album search for it never returns it, not even among his other records.
  // A song from it does come back, and it carries the album's id.
  if (!anchor) return null;
  const viaSong = new URL(SEARCH);
  viaSong.searchParams.set("term", `${wantArtist} ${plain(anchor)}`.trim());
  viaSong.searchParams.set("entity", "song");
  viaSong.searchParams.set("limit", "15");
  const second = await fetch(viaSong, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!second.ok) return null;
  const songs = (await second.json()) as { results?: SongResult[] };
  const found = (songs.results ?? []).find(
    (result) =>
      result.collectionId &&
      sameName(plain(result.artistName ?? ""), wantArtist) &&
      sameName(plain(result.collectionName ?? ""), wantAlbum),
  );
  return found?.collectionId ?? null;
}

async function lookupAlbum(
  artist: string,
  album: string,
  anchor?: string,
): Promise<Map<string, Preview>> {
  const songs = new Map<string, Preview>();

  const id = await albumId(artist, album, anchor);
  if (!id) return songs;

  const tracks = new URL(LOOKUP);
  tracks.searchParams.set("id", String(id));
  tracks.searchParams.set("entity", "song");
  tracks.searchParams.set("limit", "200");
  const listing = await fetch(tracks, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!listing.ok) throw new Error(`Apple album lookup ${listing.status}`);
  const body2 = (await listing.json()) as { results?: Result[] };

  for (const song of body2.results ?? []) {
    if (!song.previewUrl || !song.trackViewUrl || !song.trackName) continue;
    const key = plain(song.trackName);
    // The album's own order wins, so a bonus or alternate take later in the
    // listing never displaces the real one.
    if (!songs.has(key)) songs.set(key, { audio: song.previewUrl, link: song.trackViewUrl });
  }
  return songs;
}

function albumPreviews(artist: string, album: string, anchor?: string) {
  const key = `${plain(artist)}|${plain(album)}`;
  let pending = albums.get(key);
  if (!pending) {
    pending = lookupAlbum(artist, album, anchor).catch(() => {
      // Worth another go later; meanwhile each song falls back to a search.
      albums.delete(key);
      return new Map<string, Preview>();
    });
    albums.set(key, pending);
  }
  return pending;
}

/** The album's version of one song, allowing for "(feat. …)" on Apple's side. */
function fromAlbum(songs: Map<string, Preview>, title: string) {
  const want = plain(title);
  const exact = songs.get(want);
  if (exact) return exact;

  // Spacing disagrees more often than you'd think: "1 Train" and "1Train".
  const tight = want.replace(/ /g, "");
  for (const [theirs, preview] of songs) {
    if (theirs.replace(/ /g, "") === tight) return preview;
  }

  // A trailing credit Apple kept and MusicBrainz didn't. The space matters:
  // without it "Angel" would happily answer for "Angels".
  for (const [theirs, preview] of songs) {
    if (theirs.startsWith(`${want} `)) return preview;
  }

  // Last, the same song with an explicit word starred out.
  for (const [theirs, preview] of songs) {
    if (sameSong(theirs, want)) return preview;
  }
  return null;
}

/**
 * Whether this song is already known to have nothing on Apple Music, so a
 * button can stay dimmed rather than offering a play it can't honour. Read
 * during render: it never starts a lookup of its own.
 */
export function noPreviewFor(artist: string, title: string) {
  return missing.has(`${plain(artist)}|${plain(title)}`);
}

/** The album's tracklist first, then a plain search for anything it missed. */
async function resolve(artist: string, title: string, album?: string, anchor?: string) {
  if (album) {
    const songs = await albumPreviews(artist, album, anchor ?? title);
    const hit = fromAlbum(songs, title);
    if (hit) return hit;
  }
  return search(artist, title);
}

/**
 * The preview for one song, or null when Apple has no clear match.
 *
 * `album` lets one lookup cover the whole record; `anchor` is a song known to
 * be on it — the first track — used to find the album when Apple's album
 * search can't.
 */
export function findPreview(
  artist: string,
  title: string,
  album?: string,
  anchor?: string,
): Promise<Preview | null> {
  const key = `${plain(artist)}|${plain(title)}`;
  let pending = found.get(key);
  if (!pending) {
    pending = resolve(artist, title, album, anchor).then(
      (preview) => {
        // Apple looked and had nothing: worth remembering for the visit.
        if (!preview) missing.add(key);
        return preview;
      },
      () => {
        // A failed lookup is worth trying again later; a clean "no match" isn't.
        found.delete(key);
        return null;
      },
    );
    found.set(key, pending);
  }
  return pending;
}
