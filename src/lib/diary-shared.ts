/**
 * The listening diary's plain rules, shared with the app (`pnpm sync:web`):
 * what counts as listening to an album on a day, how album names are folded
 * so the same album matches up from any source, and reading Spotify's
 * extended streaming history. Plain TypeScript, no framework: the app runs it
 * on the phone, where Spotify files and the Apple Music library are read.
 */

export const DIARY_SOURCES = ["lastfm", "spotify", "apple", "hand"] as const;
export type DiarySource = (typeof DIARY_SOURCES)[number];

/** The sources that import, each of which can be removed all at once. */
export const IMPORT_SOURCES = ["lastfm", "spotify", "apple"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const SOURCE_NAME: Record<DiarySource, string> = {
  lastfm: "Last.fm",
  spotify: "Spotify",
  apple: "Apple Music",
  hand: "By hand",
};

/** An imported album counts on a day at this many different songs… */
export const MIN_SONGS = 4;
/** …or this many minutes of it. */
export const MIN_MINUTES = 20;
/** A play shorter than this is a skip. */
export const SKIP_MS = 30_000;
/** Last.fm doesn't say how long a play lasted; this stands in for one song. */
export const SCROBBLE_MS = 210_000;
/** Album-days sent in one upload. */
export const BATCH_MAX = 500;
/** The most entries one diary holds. */
export const DIARY_MAX = 50_000;
/** An upload that adds this many albums or more is announced with a push. */
export const ANNOUNCE_MIN = 20;
/** The longest artist, album or song name kept. */
export const NAME_MAX = 300;

/** One play of a song, from any source. `ms` is null when the source doesn't say. */
export type Play = { at: number; artist: string; album: string; song: string; ms: number | null };

/** An album listened to on a day, as the diary keeps it. */
export type AlbumDay = {
  day: string;
  key: string;
  artist: string;
  album: string;
  songHint: string | null;
  songs: number;
  minutes: number;
  plays: number;
};

const EDITION_WORDS =
  "deluxe|edition|remaster(?:ed)?|expanded|anniversary|bonus|special|collector'?s|legacy|reissue|version|mono|stereo|explicit|clean|super|complete";
const BRACKETED = new RegExp(`\\s*[([][^)\\]]*\\b(?:${EDITION_WORDS})\\b[^)\\]]*[)\\]]`, "giu");
const DASHED = new RegExp(`\\s+[-–—]\\s+[^-–—]*\\b(?:${EDITION_WORDS})\\b.*$`, "iu");

/** An album's title without "(Deluxe Edition)", "- 2011 Remaster" and the like. */
export function withoutEdition(album: string): string {
  const stripped = album.replace(BRACKETED, "").replace(DASHED, "").trim();
  return stripped || album.trim();
}

/** Lower case, no accents or punctuation, "&" as "and", single spaces. */
export function foldName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The key one album has from any source or edition: "artist|album", folded. */
export function albumKey(artist: string, album: string): string {
  return `${foldName(artist)}|${foldName(withoutEdition(album))}`.slice(0, NAME_MAX);
}

/** Whether two titles name the same album, editions aside. */
export function sameAlbum(a: string, b: string): boolean {
  return foldName(withoutEdition(a)) === foldName(withoutEdition(b));
}

/**
 * Control and format characters out, single spaces, cut to `NAME_MAX`. The
 * website tidies names again when they arrive, whoever worked them out.
 */
export function tidy(text: string): string {
  return Array.from(
    text
      .replace(/(?![\u200C\u200D])[\p{Cc}\p{Cf}]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, NAME_MAX)
    .join("");
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const days = new Map<string, string>();
/** Every time zone's offset is a multiple of a quarter of an hour. */
const QUARTER_HOUR = 900_000;

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The day `at` falls on in `timeZone`, as YYYY-MM-DD. Worked out once per
 * quarter of an hour, since a long history has hundreds of thousands of
 * plays. A time zone this device doesn't know reads as UTC.
 */
export function localDay(at: number, timeZone: string): string {
  const slot = `${timeZone}|${Math.floor(at / QUARTER_HOUR)}`;
  const known = days.get(slot);
  if (known) return known;
  let day: string;
  try {
    const parts = formatterFor(timeZone).formatToParts(at);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    day = `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    day = new Date(at).toISOString().slice(0, 10);
  }
  if (days.size > 50_000) days.clear();
  days.set(slot, day);
  return day;
}

/** Whether `day` is a real YYYY-MM-DD from 1900 up to tomorrow (time zones run ahead). */
export function isDiaryDay(day: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const at = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) return false;
  return day >= "1900-01-01" && at <= now + 86_400_000;
}

type Tally = {
  day: string;
  key: string;
  artist: string;
  album: string;
  songs: Map<string, { name: string; count: number }>;
  ms: number;
  plays: number;
};

/** One album as a history spells it, tidied and keyed; null when it can't be kept. */
type Named = { key: string; artist: string; album: string } | null;

/** A running count of album-days, fed one play at a time. */
export type AlbumTally = {
  add: (play: Play) => void;
  /** The album-days that count so far. */
  days: () => AlbumDay[];
};

/**
 * Album-days counted as plays come in, so a long history can be read a file
 * at a time without holding every play. Keeps only days that count: at
 * least `MIN_SONGS` different songs from the album that day, or
 * `MIN_MINUTES` of it. Skips (under `SKIP_MS`) and plays without an
 * artist, album or song are left out. Days are the listener's own, in
 * `timeZone`. A history names the same albums and songs over and over, so
 * each spelling is tidied and folded once.
 */
export function createAlbumTally(timeZone: string): AlbumTally {
  const tallies = new Map<string, Tally>();
  const albums = new Map<string, Named>();
  const songs = new Map<string, { name: string; key: string } | null>();

  const albumOf = (rawArtist: string, rawAlbum: string): Named => {
    // The length first, so no two pairs of names can run together the same.
    const id = `${rawArtist.length}:${rawArtist}${rawAlbum}`;
    let named = albums.get(id);
    if (named === undefined) {
      const artist = tidy(rawArtist);
      const album = tidy(rawAlbum);
      const key = albumKey(artist, album);
      named =
        artist && album && !key.startsWith("|") && !key.endsWith("|")
          ? { key, artist, album }
          : null;
      albums.set(id, named);
    }
    return named;
  };

  const songOf = (raw: string) => {
    let song = songs.get(raw);
    if (song === undefined) {
      const name = tidy(raw);
      song = name ? { name, key: foldName(name) } : null;
      songs.set(raw, song);
    }
    return song;
  };

  return {
    add(play) {
      if (play.ms !== null && play.ms < SKIP_MS) return;
      const named = albumOf(play.artist, play.album);
      const song = songOf(play.song);
      if (!named || !song) return;
      const day = localDay(play.at, timeZone);
      const id = `${day} ${named.key}`;
      let tally = tallies.get(id);
      if (!tally) {
        tally = { day, ...named, songs: new Map(), ms: 0, plays: 0 };
        tallies.set(id, tally);
      }
      const seen = tally.songs.get(song.key);
      if (seen) seen.count += 1;
      else tally.songs.set(song.key, { name: song.name, count: 1 });
      tally.ms += play.ms ?? SCROBBLE_MS;
      tally.plays += 1;
    },
    days() {
      const counted: AlbumDay[] = [];
      for (const tally of tallies.values()) {
        if (tally.songs.size < MIN_SONGS && tally.ms < MIN_MINUTES * 60_000) continue;
        let hint: { name: string; count: number } | null = null;
        for (const song of tally.songs.values()) if (!hint || song.count > hint.count) hint = song;
        counted.push({
          day: tally.day,
          key: tally.key,
          artist: tally.artist,
          album: tally.album,
          songHint: hint?.name ?? null,
          songs: tally.songs.size,
          minutes: Math.min(1440, Math.round(tally.ms / 60_000)),
          plays: tally.plays,
        });
      }
      return counted;
    },
  };
}

/** Plays grouped into album-days, by the rules of `createAlbumTally`. */
export function albumDays(plays: readonly Play[], timeZone: string): AlbumDay[] {
  const tally = createAlbumTally(timeZone);
  for (const play of plays) tally.add(play);
  return tally.days();
}

type SpotifyRow = {
  ts?: unknown;
  ms_played?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
  master_metadata_album_album_name?: unknown;
};

/**
 * Plays from one of Spotify's extended streaming history files
 * (`Streaming_History_Audio_*.json`), or null when the file isn't one: the
 * quicker Account data file has no album names. Podcasts, audiobooks and
 * Spotify's blank rows have no track name and are skipped, as are rows that
 * don't say how long they played, which can't be told from a skip.
 */
export function spotifyPlays(json: unknown): Play[] | null {
  if (!Array.isArray(json)) return null;
  const looksRight = json.some(
    (row) => row !== null && typeof row === "object" && "master_metadata_album_album_name" in row,
  );
  if (json.length > 0 && !looksRight) return null;

  const plays: Play[] = [];
  for (const row of json as SpotifyRow[]) {
    if (row === null || typeof row !== "object") continue;
    const song = row.master_metadata_track_name;
    const artist = row.master_metadata_album_artist_name;
    const album = row.master_metadata_album_album_name;
    if (typeof song !== "string" || typeof artist !== "string" || typeof album !== "string")
      continue;
    const at = typeof row.ts === "string" ? Date.parse(row.ts) : Number.NaN;
    if (!Number.isFinite(at)) continue;
    const ms = row.ms_played;
    if (typeof ms !== "number" || !Number.isFinite(ms)) continue;
    plays.push({ at, artist, album, song, ms });
  }
  return plays;
}

/** Whether a file in Spotify's download is the audio history (not video, not Account data). */
export function isSpotifyHistoryFile(name: string): boolean {
  return /(^|\/)Streaming_History_Audio_[^/]*\.json$/i.test(name);
}

/** "34 albums · 32 hours", a month's line on a diary. */
export function monthLine(albums: number, minutes: number): string {
  const count = `${albums.toLocaleString("en")} album${albums === 1 ? "" : "s"}`;
  if (minutes <= 0) return count;
  const time =
    minutes < 90
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${Math.round(minutes / 60).toLocaleString("en")} hours`;
  return `${count} · ${time}`;
}

/** A list cut into runs of `size`, for uploading. */
export function batches<T>(items: readonly T[], size = BATCH_MAX): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}

/** A diary's address. */
export const diaryHref = (username: string) => `/u/${username}/diary`;
