import { describe, expect, it, vi } from "vitest";
import { MbNotFoundError } from "@/lib/musicbrainz";
import { fairTurns, runMatcher, type MatchDeps, type Pending } from "./match";

const at = new Date("2026-10-30T12:00:00Z");
const pending = (overrides: Partial<Pending> = {}): Pending => ({
  album_key: "frank ocean|blonde",
  artist_name: "Frank Ocean",
  album_name: "Blonde",
  song_hint: "Nikes",
  tries: 0,
  added_by: "u1",
  ...overrides,
});
/** `count` names from one person's diary, a song each. */
const namesOf = (person: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    pending({ album_key: `${person}|${i}`, album_name: `${person} ${i}`, added_by: person }),
  );
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const frank = [{ name: "Frank Ocean", artist: { id: "a1", name: "Frank Ocean" } }];

function deps(overrides: Partial<MatchDeps> = {}): MatchDeps {
  return {
    pending: vi.fn(async () => [pending()]),
    token: "T",
    lookup: vi.fn(async () => [{ recording: "r1", releaseName: "Blonde" }]),
    groups: vi.fn(
      async () => new Map([["r1", { group: "g1", title: "Blonde", artist: "Frank Ocean" }]]),
    ),
    search: vi.fn(async () => []),
    saveAlbum: vi.fn(async () => undefined),
    matched: vi.fn(async () => undefined),
    missed: vi.fn(async () => undefined),
    failed: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("fairTurns", () => {
  it("takes turns between people, a few names each, up to the batch", () => {
    const names = [...namesOf("a", 30), ...namesOf("b", 3), ...namesOf("c", 2)];
    const taken = fairTurns(names, 10, 12);
    expect(taken.map((n) => n.album_key)).toEqual([
      "a|0",
      "b|0",
      "c|0",
      "a|1",
      "b|1",
      "c|1",
      "a|2",
      "b|2",
      "a|3",
      "a|4",
      "a|5",
      "a|6",
    ]);
    expect(fairTurns(namesOf("a", 30), 10, 100)).toHaveLength(10);
  });

  it("counts names whose diary has gone as one more person", () => {
    const names = [...namesOf("a", 3), pending({ album_key: "x|1", added_by: null })];
    expect(fairTurns(names, 1, 10).map((n) => n.album_key)).toEqual(["a|0", "x|1"]);
  });
});

describe("runMatcher", () => {
  it("reads a wide pool of names and takes turns between the diaries they came from", async () => {
    const d = deps({
      token: null,
      pending: vi.fn(async () => [...namesOf("a", 30), ...namesOf("b", 2)]),
    });
    await runMatcher(at, Date.now() + 10_000, d);
    expect(d.pending).toHaveBeenCalledWith(at, 500);
    const searched = vi.mocked(d.search).mock.calls.map(([, album]) => album);
    expect(searched.slice(0, 4)).toEqual(["a 0", "b 0", "a 1", "b 1"]);
    expect(searched.filter((album) => album.startsWith("a "))).toHaveLength(10);
  });

  it("asks ListenBrainz about 50 names a run at most", async () => {
    const people = ["a", "b", "c", "d", "e", "f"];
    const d = deps({
      pending: vi.fn(async () => people.flatMap((p) => namesOf(p, 10))),
      lookup: vi.fn(async (items: unknown[]) => items.map(() => null)),
    });
    await runMatcher(at, Date.now() + 10_000, d);
    expect(vi.mocked(d.lookup).mock.calls[0]?.[0]).toHaveLength(50);
  });

  it("stops ListenBrainz's matches at the deadline, leaving them for the next run", async () => {
    const d = deps({
      lookup: vi.fn(async () => {
        await pause(80);
        return [{ recording: "r1", releaseName: "Blonde" }];
      }),
    });
    await runMatcher(at, Date.now() + 40, d);
    expect(d.lookup).toHaveBeenCalled();
    expect(d.groups).not.toHaveBeenCalled();
    expect(d.matched).not.toHaveBeenCalled();
    expect(d.search).not.toHaveBeenCalled();
  });

  it("settles no more ListenBrainz matches once the deadline passes", async () => {
    const d = deps({
      pending: vi.fn(async () => [pending(), pending({ album_key: "frank ocean|blonde 2" })]),
      lookup: vi.fn(async () => [
        { recording: "r1", releaseName: "Blonde" },
        { recording: "r1", releaseName: "Blonde" },
      ]),
      saveAlbum: vi.fn(async () => {
        await pause(80);
      }),
    });
    await runMatcher(at, Date.now() + 40, d);
    expect(d.matched).toHaveBeenCalledTimes(1);
  });

  it("matches through ListenBrainz first", async () => {
    const d = deps();
    const report = await runMatcher(at, Date.now() + 10_000, d);
    expect(d.saveAlbum).toHaveBeenCalledWith({
      group: "g1",
      title: "Blonde",
      artist: "Frank Ocean",
    });
    expect(d.matched).toHaveBeenCalledWith("frank ocean|blonde", "g1", "listenbrainz");
    expect(d.search).not.toHaveBeenCalled();
    expect(report.matched).toBe(1);
  });

  it("won't take a ListenBrainz album with another title (a compilation, say)", async () => {
    const d = deps({
      groups: vi.fn(
        async () =>
          new Map([["r1", { group: "g9", title: "Greatest Hits", artist: "Frank Ocean" }]]),
      ),
      search: vi.fn(async () => [{ id: "g1", title: "Blonde", "artist-credit": frank }]),
    });
    await runMatcher(at, Date.now() + 10_000, d);
    expect(d.matched).toHaveBeenCalledWith("frank ocean|blonde", "g1", "musicbrainz");
    expect(d.matched).toHaveBeenCalledTimes(1);
  });

  it("goes to MusicBrainz without a token or a song, searching without the edition", async () => {
    const d = deps({
      token: null,
      pending: vi.fn(async () => [pending({ album_name: "Blonde (Deluxe Edition)" })]),
      search: vi.fn(async () => [
        { id: "g0", title: "Endless", "artist-credit": frank },
        { id: "g1", title: "Blonde (Deluxe)", "artist-credit": frank },
      ]),
    });
    await runMatcher(at, Date.now() + 10_000, d);
    expect(d.lookup).not.toHaveBeenCalled();
    expect(d.search).toHaveBeenCalledWith("Frank Ocean", "Blonde");
    expect(d.matched).toHaveBeenCalledWith("frank ocean|blonde", "g1", "musicbrainz");
    expect(d.saveAlbum).toHaveBeenCalledWith({
      group: "g1",
      title: "Blonde (Deluxe)",
      artist: "Frank Ocean",
      artistMbid: "a1",
    });
  });

  it("won't take an album of the same name by somebody else", async () => {
    const d = deps({
      token: null,
      search: vi.fn(async () => [
        {
          id: "g2",
          title: "Blonde",
          "artist-credit": [
            { name: "Coeur de pirate", artist: { id: "a2", name: "Coeur de pirate" } },
          ],
        },
      ]),
    });
    await runMatcher(at, Date.now() + 10_000, d);
    expect(d.matched).not.toHaveBeenCalled();
    expect(d.missed).toHaveBeenCalled();
  });

  it("counts a try when nothing matches, and waits longer each time", async () => {
    const d = deps({
      lookup: vi.fn(async () => [null]),
      pending: vi.fn(async () => [pending({ tries: 1 })]),
    });
    const report = await runMatcher(at, Date.now() + 10_000, d);
    expect(d.missed).toHaveBeenCalledWith(
      "frank ocean|blonde",
      2,
      new Date(at.getTime() + 6 * 3_600_000),
    );
    expect(report.missed).toBe(1);
  });

  it("counts a search MusicBrainz won't read as nothing found", async () => {
    const d = deps({
      token: null,
      search: vi.fn(async () => Promise.reject(new MbNotFoundError("bad query"))),
    });
    const report = await runMatcher(at, Date.now() + 10_000, d);
    expect(d.missed).toHaveBeenCalledWith(
      "frank ocean|blonde",
      1,
      new Date(at.getTime() + 3_600_000),
    );
    expect(report.errors).toBe(0);
  });

  it("doesn't count a try when a service fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = deps({
      lookup: vi.fn(async () => Promise.reject(new Error("down"))),
      search: vi.fn(async () => Promise.reject(new Error("down"))),
    });
    const report = await runMatcher(at, Date.now() + 10_000, d);
    expect(d.failed).toHaveBeenCalledWith(
      "frank ocean|blonde",
      new Date(at.getTime() + 15 * 60_000),
    );
    expect(d.missed).not.toHaveBeenCalled();
    expect(report.errors).toBeGreaterThan(0);
    vi.mocked(console.error).mockRestore();
  });

  it("leaves what's left for the next run at the deadline", async () => {
    const d = deps({ token: null });
    await runMatcher(at, Date.now() - 1, d);
    expect(d.search).not.toHaveBeenCalled();
  });
});
