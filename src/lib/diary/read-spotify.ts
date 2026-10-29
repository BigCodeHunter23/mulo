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

/** A picked file, read only when its turn comes. */
export type PickedFile = { name: string; read: () => Promise<Uint8Array> };
export type SpotifyRead =
  | {
      ok: true;
      days: AlbumDay[];
      plays: number;
      first: string | null;
      last: string | null;
      /** Files that couldn't be read (a broken zip, a file cut short), so some may be missing. */
      unreadable: number;
    }
  | { ok: false; error: string };

/** Lets the page paint (a "Reading…" line) between files. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The audio history files in a zip, by name, without unzipping any. */
function historyNames(zip: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(zip, {
    filter: (entry) => {
      if (isSpotifyHistoryFile(entry.name)) names.push(entry.name);
      return false;
    },
  });
  return names;
}

/**
 * One file out of a zip. Unzipped here rather than in fflate's worker, which
 * would be sent a copy of the whole zip for each file.
 */
function unzipOne(zip: Uint8Array, name: string): Uint8Array {
  const bytes = unzipSync(zip, { filter: (entry) => entry.name === name })[name];
  if (!bytes) throw new Error(`${name} wasn't in the zip`);
  return bytes;
}

export async function readSpotifyFiles(
  files: readonly PickedFile[],
  timeZone: string,
  { breathe = nextTask }: { breathe?: () => Promise<void> } = {},
): Promise<SpotifyRead> {
  const tally = createAlbumTally(timeZone);
  let plays = 0;
  let readAny = false;
  let unreadable = 0;

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

  for (const file of files) {
    const zip = /\.zip$/i.test(file.name);
    if (!zip && !/\.json$/i.test(file.name)) continue;
    let bytes: Uint8Array;
    try {
      bytes = await file.read();
    } catch {
      unreadable += 1;
      continue;
    }
    if (!zip) {
      if (!take(bytes)) unreadable += 1;
      await breathe();
      continue;
    }
    let names: string[];
    try {
      names = historyNames(bytes);
    } catch {
      // Not a zip after all, or a broken one.
      unreadable += 1;
      continue;
    }
    for (const name of names) {
      try {
        if (!take(unzipOne(bytes, name))) unreadable += 1;
      } catch {
        unreadable += 1;
      }
      await breathe();
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
