import { describe, expect, it } from "vitest";
import {
  albumDays,
  albumKey,
  batches,
  foldName,
  isDiaryDay,
  isSpotifyHistoryFile,
  localDay,
  monthLine,
  sameAlbum,
  spotifyPlays,
  withoutEdition,
  type Play,
} from "./diary-shared";

const at = (iso: string) => Date.parse(iso);
const play = (overrides: Partial<Play> = {}): Play => ({
  at: at("2026-10-12T10:00:00Z"),
  artist: "Frank Ocean",
  album: "Blonde",
  song: "Nikes",
  ms: 200_000,
  ...overrides,
});

describe("names", () => {
  it("folds case, accents, punctuation and ampersands", () => {
    expect(foldName("  Beyoncé & JAY-Z ")).toBe("beyonce and jay z");
    expect(foldName("Sigur Rós")).toBe("sigur ros");
  });

  it("drops edition words in brackets or after a dash", () => {
    expect(withoutEdition("Abbey Road (Remastered 2019)")).toBe("Abbey Road");
    expect(withoutEdition("Rumours [Super Deluxe]")).toBe("Rumours");
    expect(withoutEdition("Nevermind - 20th Anniversary Edition")).toBe("Nevermind");
    expect(withoutEdition("Blonde")).toBe("Blonde");
    // A title that is only edition words stays as it is.
    expect(withoutEdition("(Deluxe)")).toBe("(Deluxe)");
  });

  it("gives two editions of one album the same key", () => {
    expect(albumKey("The Beatles", "Abbey Road (Remastered 2019)")).toBe(
      albumKey("the beatles", "Abbey Road"),
    );
    expect(albumKey("Frank Ocean", "Blonde")).toBe("frank ocean|blonde");
  });

  it("knows the same album under another spelling", () => {
    expect(sameAlbum("Abbey Road (2019 Mix)", "abbey road")).toBe(false);
    expect(sameAlbum("Abbey Road (Remastered)", "Abbey Road")).toBe(true);
  });
});

describe("days", () => {
  it("reads the day where somebody is", () => {
    // 23:30 UTC on the 12th is the 13th in Sydney.
    expect(localDay(at("2026-10-12T23:30:00Z"), "Australia/Sydney")).toBe("2026-10-13");
    expect(localDay(at("2026-10-12T23:30:00Z"), "America/New_York")).toBe("2026-10-12");
  });

  it("reads an unknown time zone as UTC", () => {
    expect(localDay(at("2026-10-12T23:30:00Z"), "Nowhere/Special")).toBe("2026-10-12");
  });

  it("takes days from 1900 to tomorrow", () => {
    const now = at("2026-10-30T12:00:00Z");
    expect(isDiaryDay("2026-10-30", now)).toBe(true);
    expect(isDiaryDay("2026-10-31", now)).toBe(true);
    expect(isDiaryDay("2026-11-02", now)).toBe(false);
    expect(isDiaryDay("1899-12-31", now)).toBe(false);
    expect(isDiaryDay("2026-02-30", now)).toBe(false);
    expect(isDiaryDay("30/10/2026", now)).toBe(false);
  });
});

describe("the listen rule", () => {
  const songs = (names: string[], extra: Partial<Play> = {}) =>
    names.map((song, i) => play({ song, at: at("2026-10-12T10:00:00Z") + i * 60_000, ...extra }));

  it("counts an album at four different songs", () => {
    const days = albumDays(songs(["A", "B", "C", "D"], { ms: 60_000 }), "UTC");
    expect(days).toEqual([
      expect.objectContaining({
        day: "2026-10-12",
        key: "frank ocean|blonde",
        artist: "Frank Ocean",
        album: "Blonde",
        songs: 4,
        minutes: 4,
        plays: 4,
      }),
    ]);
  });

  it("counts an album at twenty minutes, however few songs", () => {
    const days = albumDays(songs(["A", "B"], { ms: 11 * 60_000 }), "UTC");
    expect(days[0]?.minutes).toBe(22);
  });

  it("leaves out a song or three on shuffle, and skips", () => {
    expect(albumDays(songs(["A", "B", "C"], { ms: 60_000 }), "UTC")).toEqual([]);
    expect(albumDays(songs(["A", "B", "C", "D"], { ms: 10_000 }), "UTC")).toEqual([]);
  });

  it("counts a song played twice once, and hints the most played", () => {
    const days = albumDays(
      [...songs(["A", "B", "C", "D"], { ms: 60_000 }), play({ song: "C", ms: 60_000 })],
      "UTC",
    );
    expect(days[0]).toEqual(expect.objectContaining({ songs: 4, plays: 5, songHint: "C" }));
  });

  it("counts a Last.fm play, which has no length, as three and a half minutes", () => {
    const days = albumDays(songs(["A", "B", "C", "D", "E", "F"], { ms: null }), "UTC");
    expect(days[0]?.minutes).toBe(21);
  });

  it("splits by the day where somebody is, and skips plays with no album", () => {
    const late = play({ at: at("2026-10-12T23:30:00Z") });
    const days = albumDays(
      [...["A", "B", "C", "D"].map((song) => ({ ...late, song })), play({ album: " " })],
      "Australia/Sydney",
    );
    expect(days.map((d) => d.day)).toEqual(["2026-10-13"]);
  });
});

describe("Spotify's files", () => {
  const row = (overrides: object = {}) => ({
    ts: "2026-10-12T10:00:00Z",
    ms_played: 200000,
    master_metadata_track_name: "Nikes",
    master_metadata_album_artist_name: "Frank Ocean",
    master_metadata_album_album_name: "Blonde",
    ...overrides,
  });

  it("reads plays from the extended history", () => {
    expect(spotifyPlays([row()])).toEqual([
      {
        at: at("2026-10-12T10:00:00Z"),
        artist: "Frank Ocean",
        album: "Blonde",
        song: "Nikes",
        ms: 200000,
      },
    ]);
  });

  it("skips podcasts and blank rows", () => {
    expect(spotifyPlays([row({ master_metadata_track_name: null }), row({ ts: "nope" })])).toEqual(
      [],
    );
  });

  it("says when a file isn't the extended history", () => {
    expect(spotifyPlays({ not: "a list" })).toBeNull();
    expect(
      spotifyPlays([{ endTime: "2026-10-12 10:00", artistName: "A", trackName: "B", msPlayed: 1 }]),
    ).toBeNull();
    expect(spotifyPlays([])).toEqual([]);
  });

  it("knows its file names", () => {
    expect(
      isSpotifyHistoryFile(
        "Spotify Extended Streaming History/Streaming_History_Audio_2019-2021_3.json",
      ),
    ).toBe(true);
    expect(isSpotifyHistoryFile("Streaming_History_Video_2020.json")).toBe(false);
    expect(isSpotifyHistoryFile("StreamingHistory_music_0.json")).toBe(false);
  });
});

describe("words and batches", () => {
  it("words a month", () => {
    expect(monthLine(34, 1920)).toBe("34 albums · 32 hours");
    expect(monthLine(1, 45)).toBe("1 album · 45 minutes");
    expect(monthLine(2, 0)).toBe("2 albums");
  });

  it("cuts a list into batches", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
