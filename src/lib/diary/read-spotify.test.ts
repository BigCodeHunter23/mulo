import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { COULD_NOT_READ, NOT_EXTENDED, readSpotifyFiles, type PickedFile } from "./read-spotify";

const row = (song: string, ts = "2026-10-12T10:00:00Z") => ({
  ts,
  ms_played: 200000,
  master_metadata_track_name: song,
  master_metadata_album_artist_name: "Frank Ocean",
  master_metadata_album_album_name: "Blonde",
});
const json = (rows: object[]) => strToU8(JSON.stringify(rows));
const picked = (name: string, bytes: Uint8Array): PickedFile => ({
  name,
  read: async () => bytes,
});
const read = (files: PickedFile[]) => readSpotifyFiles(files, "UTC", { breathe: async () => {} });

describe("readSpotifyFiles", () => {
  it("reads a zip's audio history into album-days", async () => {
    const zip = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2026_1.json": json(
        ["A", "B", "C", "D"].map((s) => row(s)),
      ),
      "Spotify Extended Streaming History/Streaming_History_Video_2026.json": json([]),
    });
    expect(await read([picked("my_spotify_data.zip", zip)])).toEqual({
      ok: true,
      days: [expect.objectContaining({ day: "2026-10-12", album: "Blonde", songs: 4 })],
      plays: 4,
      first: "2026-10-12",
      last: "2026-10-12",
      unreadable: 0,
    });
  });

  it("reads a zip a file at a time, letting the page paint between them", async () => {
    const zip = zipSync({
      "Streaming_History_Audio_2019.json": json(["A", "B"].map((s) => row(s))),
      "Streaming_History_Audio_2020.json": json(["C", "D"].map((s) => row(s))),
    });
    const breathe = vi.fn(async () => {});
    const result = await readSpotifyFiles([picked("data.zip", zip)], "UTC", { breathe });
    // Two files, one album-day: the tally runs across them.
    expect(result).toMatchObject({
      ok: true,
      plays: 4,
      days: [expect.objectContaining({ songs: 4 })],
    });
    expect(breathe.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("reads loose JSON files too, one by one", async () => {
    const reads: string[] = [];
    const file = (name: string, rows: object[]): PickedFile => ({
      name,
      read: async () => {
        reads.push(name);
        return json(rows);
      },
    });
    const result = await read([
      file(
        "Streaming_History_Audio_2026_1.json",
        ["A", "B"].map((s) => row(s)),
      ),
      file(
        "Streaming_History_Audio_2026_2.json",
        ["C", "D"].map((s) => row(s)),
      ),
    ]);
    expect(result.ok && result.days).toHaveLength(1);
    expect(reads).toEqual([
      "Streaming_History_Audio_2026_1.json",
      "Streaming_History_Audio_2026_2.json",
    ]);
  });

  it("puts the days in order, oldest first", async () => {
    const result = await read([
      picked(
        "Streaming_History_Audio_2026_1.json",
        json([
          ...["A", "B", "C", "D"].map((s) => row(s, "2026-10-12T10:00:00Z")),
          ...["A", "B", "C", "D"].map((s) => row(s, "2019-03-02T10:00:00Z")),
        ]),
      ),
    ]);
    expect(result).toMatchObject({ ok: true, plays: 8, first: "2019-03-02", last: "2026-10-12" });
    expect(result.ok && result.days.map((d) => d.day)).toEqual(["2019-03-02", "2026-10-12"]);
  });

  it("counts the files it couldn't read, and reads the rest", async () => {
    const zip = zipSync({
      "Streaming_History_Audio_2019.json": strToU8("[{ not json"),
      "Streaming_History_Audio_2020.json": json(["A", "B", "C", "D"].map((s) => row(s))),
    });
    const result = await read([
      picked("data.zip", zip),
      picked("Streaming_History_Audio_2021.json", strToU8("nope")),
      {
        name: "Streaming_History_Audio_2022.json",
        read: async () => Promise.reject(new Error("gone")),
      },
    ]);
    expect(result).toMatchObject({ ok: true, unreadable: 3 });
    expect(result.ok && result.days).toHaveLength(1);
  });

  it("says when it's the quick Account data file", async () => {
    const result = await read([
      picked(
        "StreamingHistory_music_0.json",
        json([{ endTime: "2026-10-12 10:00", artistName: "A", trackName: "B", msPlayed: 1 }]),
      ),
    ]);
    expect(result).toEqual({ ok: false, error: NOT_EXTENDED });
  });

  it("says when there's nothing it can read", async () => {
    expect(await read([picked("photo.png", new Uint8Array([1, 2]))])).toEqual({
      ok: false,
      error: NOT_EXTENDED,
    });
  });

  it("says it couldn't read a broken zip", async () => {
    expect(await read([picked("my_spotify_data.zip", new Uint8Array([1, 2, 3]))])).toEqual({
      ok: false,
      error: COULD_NOT_READ,
    });
  });
});
