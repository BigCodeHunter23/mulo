import { strFromU8, unzipSync } from "fflate";
import {
  albumDays,
  isSpotifyHistoryFile,
  spotifyPlays,
  type AlbumDay,
  type Play,
} from "@/lib/diary-shared";

/**
 * Reads what somebody picked from Spotify's download (the zip, or its
 * Streaming_History_Audio files) in the browser, into album-days. The file
 * itself never leaves the device. The app has its own copy of this
 * (src/lib/spotifyImport.ts), reading files from the phone.
 */

export const NOT_EXTENDED =
  "This isn't the extended streaming history. Ask Spotify for the Extended streaming history, then pick the zip it sends.";

export type PickedFile = { name: string; bytes: Uint8Array };
export type SpotifyRead =
  | { ok: true; days: AlbumDay[]; plays: number; first: string | null; last: string | null }
  | { ok: false; error: string };

/** The audio history files among those picked, out of any zip. */
function jsonFiles(files: readonly PickedFile[]): PickedFile[] {
  const found: PickedFile[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      try {
        const inside = unzipSync(file.bytes, {
          filter: (entry) => isSpotifyHistoryFile(entry.name),
        });
        for (const [name, bytes] of Object.entries(inside)) found.push({ name, bytes });
      } catch {
        // Not a zip after all: nothing in it to read.
      }
    } else if (/\.json$/i.test(file.name)) {
      found.push(file);
    }
  }
  return found;
}

export function readSpotifyFiles(files: readonly PickedFile[], timeZone: string): SpotifyRead {
  const plays: Play[] = [];
  let readAny = false;
  for (const file of jsonFiles(files)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(strFromU8(file.bytes));
    } catch {
      continue;
    }
    const found = spotifyPlays(parsed);
    if (found === null) continue;
    readAny = true;
    // One by one: a long history has more plays than a spread can pass.
    for (const play of found) plays.push(play);
  }
  if (!readAny) return { ok: false, error: NOT_EXTENDED };
  const days = albumDays(plays, timeZone).sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );
  return {
    ok: true,
    days,
    plays: plays.length,
    first: days[0]?.day ?? null,
    last: days.at(-1)?.day ?? null,
  };
}
