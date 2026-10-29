import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readSpotifyFiles, NOT_EXTENDED } from "./read-spotify";

const row = (song: string, ts = "2026-10-12T10:00:00Z") => ({
  ts,
  ms_played: 200000,
  master_metadata_track_name: song,
  master_metadata_album_artist_name: "Frank Ocean",
  master_metadata_album_album_name: "Blonde",
});
const json = (rows: object[]) => strToU8(JSON.stringify(rows));

describe("readSpotifyFiles", () => {
  it("reads a zip's audio history into album-days", () => {
    const zip = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2026_1.json": json(
        ["A", "B", "C", "D"].map((s) => row(s)),
      ),
      "Spotify Extended Streaming History/Streaming_History_Video_2026.json": json([]),
    });
    const result = readSpotifyFiles([{ name: "my_spotify_data.zip", bytes: zip }], "UTC");
    expect(result).toEqual({
      ok: true,
      days: [expect.objectContaining({ day: "2026-10-12", album: "Blonde", songs: 4 })],
      plays: 4,
      first: "2026-10-12",
      last: "2026-10-12",
    });
  });

  it("reads loose JSON files too", () => {
    const result = readSpotifyFiles(
      [
        {
          name: "Streaming_History_Audio_2026_1.json",
          bytes: json(["A", "B", "C", "D"].map((s) => row(s))),
        },
      ],
      "UTC",
    );
    expect(result.ok && result.days).toHaveLength(1);
  });

  it("puts the days in order, oldest first", () => {
    const result = readSpotifyFiles(
      [
        {
          name: "Streaming_History_Audio_2026_1.json",
          bytes: json([
            ...["A", "B", "C", "D"].map((s) => row(s, "2026-10-12T10:00:00Z")),
            ...["A", "B", "C", "D"].map((s) => row(s, "2019-03-02T10:00:00Z")),
          ]),
        },
      ],
      "UTC",
    );
    expect(result).toMatchObject({ ok: true, plays: 8, first: "2019-03-02", last: "2026-10-12" });
    expect(result.ok && result.days.map((d) => d.day)).toEqual(["2019-03-02", "2026-10-12"]);
  });

  it("says when it's the quick Account data file", () => {
    const result = readSpotifyFiles(
      [
        {
          name: "StreamingHistory_music_0.json",
          bytes: json([
            { endTime: "2026-10-12 10:00", artistName: "A", trackName: "B", msPlayed: 1 },
          ]),
        },
      ],
      "UTC",
    );
    expect(result).toEqual({ ok: false, error: NOT_EXTENDED });
  });

  it("says when there's nothing it can read", () => {
    expect(readSpotifyFiles([{ name: "photo.png", bytes: new Uint8Array([1, 2]) }], "UTC")).toEqual(
      { ok: false, error: NOT_EXTENDED },
    );
  });

  it("says so for a broken zip", () => {
    expect(
      readSpotifyFiles([{ name: "my_spotify_data.zip", bytes: new Uint8Array([1, 2, 3]) }], "UTC"),
    ).toEqual({ ok: false, error: NOT_EXTENDED });
  });
});
