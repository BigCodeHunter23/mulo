import { describe, expect, it } from "vitest";
import type { MbReleaseGroup } from "@/lib/musicbrainz";
import { cleanTitle, confirmGroup, isCalendarDay } from "@/lib/releases/confirm";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const CLIPSE = "0e05ba8a-56a7-4ea6-9d11-8f4f2d10e2d1";
const tyler = { name: "Tyler, the Creator", artist: { id: TYLER, name: "Tyler, the Creator" } };
const clipse = { name: "Clipse", joinphrase: " & ", artist: { id: CLIPSE, name: "Clipse" } };

const group = (over: Partial<MbReleaseGroup> = {}): MbReleaseGroup => ({
  id: "g",
  title: "CHROMAKOPIA",
  "primary-type": "Album",
  "secondary-types": [],
  "first-release-date": "2026-10-30",
  "artist-credit": [tyler],
  ...over,
});
const pending = { group: "g", artists: [TYLER], listed: "2026-10-30" };
const today = "2026-10-30";

describe("isCalendarDay", () => {
  it("knows real days from impossible ones", () => {
    expect(isCalendarDay("2026-10-30")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-10")).toBe(false);
    expect(isCalendarDay("0000-00-00")).toBe(false);
  });
});

describe("cleanTitle", () => {
  it("trims, drops characters Postgres can't keep, and cuts to 500 characters", () => {
    expect(cleanTitle("  IGOR \u0000")).toBe("IGOR");
    expect(cleanTitle("  ")).toBeNull();
    expect(cleanTitle("é".repeat(501))).toBe("é".repeat(500));
    // A character outside the basic plane is never cut in half.
    const cut = cleanTitle(`${"x".repeat(499)}🎵🎵`);
    expect(cut).toBe(`${"x".repeat(499)}🎵`);
  });
});

describe("confirmGroup", () => {
  it("confirms a new album by the artist followed", () => {
    expect(confirmGroup(group(), pending, today)).toEqual({
      title: "CHROMAKOPIA",
      kind: "album",
      date: "2026-10-30",
      primary: { id: TYLER, name: "Tyler, the Creator" },
      artists: [TYLER],
      credit: "Tyler, the Creator",
    });
    expect(confirmGroup(group({ "primary-type": "EP" }), pending, today)?.kind).toBe("ep");
  });

  it("refuses secondary types and other primary types", () => {
    expect(confirmGroup(group({ "secondary-types": ["Live"] }), pending, today)).toBeNull();
    expect(confirmGroup(group({ "secondary-types": ["Compilation"] }), pending, today)).toBeNull();
    expect(confirmGroup(group({ "primary-type": "Single" }), pending, today)).toBeNull();
    expect(confirmGroup(group({ "primary-type": undefined }), pending, today)).toBeNull();
  });

  it("takes MusicBrainz's date, or ListenBrainz's when MusicBrainz only has its month", () => {
    expect(confirmGroup(group({ "first-release-date": "2026-11-06" }), pending, today)?.date).toBe(
      "2026-11-06",
    );
    expect(confirmGroup(group({ "first-release-date": "2026-10" }), pending, today)?.date).toBe(
      "2026-10-30",
    );
    expect(confirmGroup(group({ "first-release-date": "2025" }), pending, today)).toBeNull();
  });

  it("takes ListenBrainz's date when MusicBrainz's isn't a real day", () => {
    expect(confirmGroup(group({ "first-release-date": "2026-02-30" }), pending, today)?.date).toBe(
      "2026-10-30",
    );
  });

  it("cuts a long title to 500 characters, and refuses an empty one", () => {
    const long = confirmGroup(group({ title: "x".repeat(600) }), pending, today);
    expect(long?.title).toHaveLength(500);
    expect(confirmGroup(group({ title: " \u0000 " }), pending, today)).toBeNull();
  });

  it("refuses a reissue of an old record", () => {
    expect(confirmGroup(group({ "first-release-date": "1995-03-02" }), pending, today)).toBeNull();
  });

  it("needs a listed artist on the credits, and files it under the first credit", () => {
    expect(confirmGroup(group(), { ...pending, artists: [CLIPSE] }, today)).toBeNull();
    const together = confirmGroup(group({ "artist-credit": [clipse, tyler] }), pending, today);
    expect(together?.primary).toEqual({ id: CLIPSE, name: "Clipse" });
    expect(together?.credit).toBe("Clipse & Tyler, the Creator");
  });

  it("keeps every credited artist, once each", () => {
    const twice = confirmGroup(
      group({ "artist-credit": [clipse, tyler, { ...clipse, joinphrase: "" }] }),
      pending,
      today,
    );
    expect(twice?.artists).toEqual([CLIPSE, TYLER]);
  });
});
