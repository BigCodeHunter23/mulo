import { describe, expect, it, vi } from "vitest";
import { MbNotFoundError } from "@/lib/musicbrainz";
import { runMatcher, type MatchDeps, type Pending } from "./match";

const at = new Date("2026-10-30T12:00:00Z");
const pending = (overrides: Partial<Pending> = {}): Pending => ({
  album_key: "frank ocean|blonde",
  artist_name: "Frank Ocean",
  album_name: "Blonde",
  song_hint: "Nikes",
  tries: 0,
  ...overrides,
});
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

describe("runMatcher", () => {
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
