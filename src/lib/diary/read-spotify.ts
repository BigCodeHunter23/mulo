import { strFromU8, unzipSync } from "fflate";
import {
  createAlbumTally,
  isSpotifyHistoryFile,
  spotifyPlays,
  type AlbumDay,
} from "@/lib/diary-shared";

/**
 * Reads what somebody picked from Spotify's download (the zip, or its
 * Streaming_History_Audio files) in the browser, into album-days. The file
 * itself never leaves the device. A long history runs to a hundred megabytes
 * or so, so it's read a file at a time: each one is unzipped, read, counted
 * into a running tally and let go before the next, with a pause between for
 * the page to paint. The app has its own copy of this
 * (src/lib/spotifyImport.ts), reading files from the phone.
 */

export const NOT_EXTENDED =
  "This isn't the extended streaming history. Ask Spotify for the Extended streaming history, then pick the zip it sends.";
export const COULD_NOT_READ = "Couldn't read that file. Please try again.";
export const TOO_BIG =
  "That file is too big to read here. Pick the zip Spotify sent, or its Streaming_History_Audio files.";

/**
 * Limits, so a crafted zip (a small file unpacking to gigabytes) can't take
 * the tab down. A real history is a few dozen files of a few megabytes each.
 */
const MB = 1024 * 1024;
/** A picked file bigger than this isn't read at all. */
export const MAX_FILE_BYTES = 300 * MB;
/** A history file in a zip claiming to unpack bigger than this is skipped. */
export const MAX_ENTRY_BYTES = 150 * MB;
/** History files read out of zips, in all. */
export const MAX_ENTRIES = 200;
/** Bytes unpacked out of zips, in all, before reading stops. */
export const MAX_UNPACKED_BYTES = 1536 * MB;

/** A picked file, read only when its turn comes. */
export type PickedFile = { name: string; size: number; read: () => Promise<Uint8Array> };
export type SpotifyRead =
  | {
      ok: true;
      days: AlbumDay[];
      plays: number;
      first: string | null;
      last: string | null;
      /** Files that couldn't be read (a broken zip, a file cut short, one too big), so some may be missing. */
      unreadable: number;
    }
  | { ok: false; error: string };

/** Lets the page paint (a "Reading…" line) between files. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A history file in a zip, and the most it says it unpacks to. */
type ZipEntry = { name: string; bytes: number };

/**
 * The audio history files in a zip, listed once without unzipping any, up to
 * `room` of them. Any too big, named twice or past `room` are skipped.
 */
function historyEntries(zip: Uint8Array, room: number): { entries: ZipEntry[]; skipped: number } {
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  unzipSync(zip, {
    filter: (entry) => {
      if (!isSpotifyHistoryFile(entry.name)) return false;
      // A stored entry is copied at its packed size, a deflated one unpacked into its claimed size.
      const bytes = Math.max(entry.size, entry.originalSize);
      if (bytes > MAX_ENTRY_BYTES || seen.has(entry.name) || entries.length >= room) {
        skipped += 1;
      } else {
        seen.add(entry.name);
        entries.push({ name: entry.name, bytes });
      }
      return false;
    },
  });
  return { entries, skipped };
}

/**
 * One file out of a zip, by its exact name, and only the first of that name.
 * Unzipped here rather than in fflate's worker, which would be sent a copy of
 * the whole zip for each file.
 */
function unzipOne(zip: Uint8Array, name: string): Uint8Array {
  let found = false;
  const bytes = unzipSync(zip, {
    filter: (entry) => {
      if (found || entry.name !== name) return false;
      found = true;
      return true;
    },
  })[name];
  if (!bytes) throw new Error(`${name} wasn't in the zip`);
  return bytes;
}

const readable = (name: string) => /\.(zip|json)$/i.test(name);

export async function readSpotifyFiles(
  files: readonly PickedFile[],
  timeZone: string,
  { breathe = nextTask }: { breathe?: () => Promise<void> } = {},
): Promise<SpotifyRead> {
  if (files.some((file) => readable(file.name) && file.size > MAX_FILE_BYTES)) {
    return { ok: false, error: TOO_BIG };
  }
  const tally = createAlbumTally(timeZone);
  let plays = 0;
  let readAny = false;
  let unreadable = 0;
  let listed = 0;
  let unpacked = 0;

  /** Counts one history file into the tally; false when it can't be read. */
  const take = (bytes: Uint8Array): boolean => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(strFromU8(bytes));
    } catch {
      return false;
    }
    const found = spotifyPlays(parsed);
    if (found === null) return true;
    readAny = true;
    plays += found.length;
    for (const play of found) tally.add(play);
    return true;
  };

  /** Reads a zip's history files, within what's left of the limits. */
  const takeZip = async (zip: Uint8Array) => {
    const { entries, skipped } = historyEntries(zip, MAX_ENTRIES - listed);
    listed += entries.length;
    unreadable += skipped;
    for (const entry of entries) {
      if (unpacked + entry.bytes > MAX_UNPACKED_BYTES) {
        // Stop: this one and the rest go unread.
        unpacked = MAX_UNPACKED_BYTES;
        unreadable += 1;
        continue;
      }
      try {
        const bytes = unzipOne(zip, entry.name);
        unpacked += bytes.length;
        if (!take(bytes)) unreadable += 1;
      } catch {
        unreadable += 1;
      }
      await breathe();
    }
  };

  for (const file of files) {
    if (!readable(file.name)) continue;
    let bytes: Uint8Array;
    try {
      bytes = await file.read();
    } catch {
      unreadable += 1;
      continue;
    }
    if (!/\.zip$/i.test(file.name)) {
      if (!take(bytes)) unreadable += 1;
      await breathe();
      continue;
    }
    try {
      await takeZip(bytes);
    } catch {
      // Not a zip after all, or a broken one.
      unreadable += 1;
    }
  }

  if (!readAny) return { ok: false, error: unreadable > 0 ? COULD_NOT_READ : NOT_EXTENDED };
  const days = tally.days().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return {
    ok: true,
    days,
    plays,
    first: days[0]?.day ?? null,
    last: days.at(-1)?.day ?? null,
    unreadable,
  };
}
