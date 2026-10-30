import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/releases/store", () => ({}));

import { MbResponseError, type MbReleaseGroup } from "@/lib/musicbrainz";
import { runReleasesTick, type ReleasesTickDeps } from "@/lib/releases/tick";

const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const GROUP = "6ca2762c-ffb5-4ea1-a8c6-2f25993fc99a";
const OTHER = "8ddd27bd-16c5-4205-9eff-f55a2951802a";
// Ten past midnight UTC on 30 Oct: the first run of the day.
const AT = new Date("2026-10-30T00:10:00Z");
const later = () => Date.now() + 30_000;

const album = (over: Partial<MbReleaseGroup> = {}): MbReleaseGroup => ({
  id: GROUP,
  title: "CHROMAKOPIA",
  "primary-type": "Album",
  "secondary-types": [],
  "first-release-date": "2026-10-30",
  "artist-credit": [{ artist: { id: TYLER, name: "Tyler, the Creator" } }],
  ...over,
});

const waiting = (group: string, tries = 0) => ({
  group,
  artists: [TYLER],
  listed: "2026-10-30",
  tries,
});

function deps(over: Partial<ReleasesTickDeps> = {}): ReleasesTickDeps {
  return {
    claimRead: vi.fn(async () => true),
    markRead: vi.fn(async () => {}),
    readFresh: vi.fn(async () => [
      {
        group: GROUP,
        artists: [TYLER],
        date: "2026-10-30",
        kind: "album" as const,
        title: "CHROMAKOPIA",
      },
    ]),
    followedAmong: vi.fn(async () => new Set([TYLER])),
    listedDates: vi.fn(async () => new Map<string, string>()),
    queue: vi.fn(async () => {}),
    pending: vi.fn(async () => [
      { group: GROUP, artists: [TYLER], listed: "2026-10-30", tries: 0 },
    ]),
    lookUp: vi.fn(async () => album()),
    saveConfirmed: vi.fn(async () => {}),
    refuse: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    ...over,
  };
}

describe("runReleasesTick", () => {
  it("reads the day once, files releases by followed artists, and confirms them", async () => {
    const d = deps();
    expect(await runReleasesTick(AT, later(), d)).toEqual({
      read: true,
      queued: 1,
      confirmed: 1,
      refused: 0,
      errors: 0,
    });
    expect(d.claimRead).toHaveBeenCalledWith("2026-10-30");
    expect(d.followedAmong).toHaveBeenCalledWith([TYLER]);
    expect(d.queue).toHaveBeenCalledWith([
      {
        group: GROUP,
        artist: TYLER,
        artists: [TYLER],
        title: "CHROMAKOPIA",
        kind: "album",
        listed: "2026-10-30",
      },
    ]);
    expect(d.markRead).toHaveBeenCalledWith("2026-10-30");
    expect(d.saveConfirmed).toHaveBeenCalledWith(
      GROUP,
      expect.objectContaining({ kind: "album", date: "2026-10-30" }),
    );
  });

  it("skips the read once it's done or out of tries, and still confirms", async () => {
    const d = deps({ claimRead: vi.fn(async () => false) });
    expect(await runReleasesTick(AT, later(), d)).toMatchObject({ read: false, confirmed: 1 });
    expect(d.readFresh).not.toHaveBeenCalled();
  });

  it("leaves the day to try again when ListenBrainz fails", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    const d = deps({ readFresh: vi.fn(async () => Promise.reject(new Error("503"))) });
    expect(await runReleasesTick(AT, later(), d)).toMatchObject({
      read: false,
      errors: 1,
      confirmed: 1,
    });
    expect(d.markRead).not.toHaveBeenCalled();
  });

  it("refuses what MusicBrainz doesn't agree with, or doesn't have", async () => {
    const d = deps({
      pending: vi.fn(async () => [waiting(GROUP), waiting(OTHER)]),
      lookUp: vi.fn(async (group: string) =>
        group === GROUP ? album({ "secondary-types": ["Live"] }) : null,
      ),
    });
    expect(await runReleasesTick(AT, later(), d)).toMatchObject({ confirmed: 0, refused: 2 });
    expect(d.refuse).toHaveBeenCalledWith(GROUP);
    expect(d.refuse).toHaveBeenCalledWith(OTHER);
  });

  it("starts nothing after its deadline", async () => {
    const d = deps();
    expect(await runReleasesTick(AT, Date.now() - 1, d)).toMatchObject({
      read: false,
      confirmed: 0,
    });
    expect(d.claimRead).not.toHaveBeenCalled();
    expect(d.lookUp).not.toHaveBeenCalled();
  });

  describe("when one release fails", () => {
    const THIRD = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
    const down = () => new MbResponseError(503, "/release-group/x");
    const timedOut = () => new DOMException("The operation timed out.", "TimeoutError");

    it("counts a try on it and carries on with the rest", async () => {
      const spy = quiet();
      const d = deps({
        claimRead: vi.fn(async () => false),
        pending: vi.fn(async () => [waiting(GROUP, 1), waiting(OTHER)]),
        saveConfirmed: vi.fn(async (group: string) => {
          if (group === GROUP) throw new Error("value too long");
        }),
        lookUp: vi.fn(async (group: string) => album({ id: group })),
      });
      expect(await runReleasesTick(AT, later(), d)).toMatchObject({ errors: 1, confirmed: 1 });
      expect(d.fail).toHaveBeenCalledWith(GROUP, 2);
      expect(d.saveConfirmed).toHaveBeenCalledWith(OTHER, expect.anything());
      spy.mockRestore();
    });

    it("counts a lookup that fails for its own reasons too", async () => {
      const spy = quiet();
      const d = deps({
        claimRead: vi.fn(async () => false),
        pending: vi.fn(async () => [waiting(GROUP), waiting(OTHER)]),
        lookUp: vi.fn(async (group: string) => {
          if (group === GROUP) throw new SyntaxError("Unexpected token");
          return album({ id: group });
        }),
      });
      expect(await runReleasesTick(AT, later(), d)).toMatchObject({ errors: 1, confirmed: 1 });
      expect(d.fail).toHaveBeenCalledWith(GROUP, 1);
      spy.mockRestore();
    });

    it("stops after two failures in a row that look like MusicBrainz being down", async () => {
      const spy = quiet();
      const d = deps({
        claimRead: vi.fn(async () => false),
        pending: vi.fn(async () => [waiting(GROUP, 1), waiting(OTHER), waiting(THIRD)]),
        lookUp: vi.fn(async (group: string) =>
          Promise.reject(group === GROUP ? down() : timedOut()),
        ),
      });
      expect(await runReleasesTick(AT, later(), d)).toMatchObject({ errors: 2, confirmed: 0 });
      expect(d.lookUp).toHaveBeenCalledTimes(2);
      // MusicBrainz being down isn't the release's fault: no try is counted.
      expect(d.fail).toHaveBeenCalledWith(GROUP, 1);
      expect(d.fail).toHaveBeenCalledWith(OTHER, 0);
      spy.mockRestore();
    });

    it("carries on after one such failure followed by a success", async () => {
      const spy = quiet();
      const d = deps({
        claimRead: vi.fn(async () => false),
        pending: vi.fn(async () => [waiting(GROUP), waiting(OTHER), waiting(THIRD)]),
        lookUp: vi.fn(async (group: string) =>
          group === OTHER ? album({ id: group }) : Promise.reject(down()),
        ),
      });
      expect(await runReleasesTick(AT, later(), d)).toMatchObject({ errors: 2, confirmed: 1 });
      expect(d.lookUp).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });

    it("still carries on when noting the failure fails", async () => {
      const spy = quiet();
      const d = deps({
        claimRead: vi.fn(async () => false),
        pending: vi.fn(async () => [waiting(GROUP), waiting(OTHER)]),
        lookUp: vi.fn(async (group: string) =>
          group === GROUP ? Promise.reject(new Error("odd")) : album({ id: group }),
        ),
        fail: vi.fn(async () => Promise.reject(new Error("database down"))),
      });
      expect(await runReleasesTick(AT, later(), d)).toMatchObject({ confirmed: 1 });
      spy.mockRestore();
    });
  });
});
