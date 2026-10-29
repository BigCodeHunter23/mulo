import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../test/fake-supabase";

/** From your listening: The Stack drawn from the albums in your diary. */

const db = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.fake.client }));
vi.mock("@/lib/raised-on", () => ({ getRaisedOn: async () => null }));
vi.mock("@/lib/artist-genres", () => ({ getArtistGenres: async () => new Map() }));
vi.mock("@/lib/hits", () => ({ playCounts: async () => new Map() }));
vi.mock("@/lib/supabase/errors", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/errors")>()),
  logQueryError: vi.fn(),
}));

import { fakeSupabase } from "../../test/fake-supabase";
import { logQueryError } from "@/lib/supabase/errors";
import { getListeningStack, listeningWaiting } from "./stack";

const BLONDE = "00000000-0000-4000-8000-0000000000aa";
const DAMN = "00000000-0000-4000-8000-0000000000bb";

const release = (mbid: string, title: string, artist: string, date: string | null) => ({
  mbid,
  title,
  artist_credit: artist,
  cover_art_url: `https://covers/${title}.jpg`,
  release_date: date,
});

beforeEach(() => {
  db.fake = fakeSupabase();
  vi.clearAllMocks();
});

describe("getListeningStack", () => {
  it("deals the most played albums first, saying how often they were played", async () => {
    db.fake.answer("rpc:diary_to_rate", {
      data: [
        { release_mbid: BLONDE, plays: 34, minutes: 120, last_day: "2026-10-12" },
        { release_mbid: DAMN, plays: 1, minutes: 40, last_day: "2026-10-01" },
      ],
      error: null,
    });
    db.fake.answer("releases", {
      data: [
        release(DAMN, "DAMN.", "Kendrick Lamar", "2017-04-14"),
        release(BLONDE, "Blonde", "Frank Ocean", "2016-08-20"),
      ],
      error: null,
    });
    db.fake.answer("tracks", {
      data: [{ release_mbid: BLONDE, position: 1, title: "Nikes", song_mbid: null }],
      error: null,
    });

    const run = await getListeningStack(10);

    expect(run).toEqual([
      {
        mbid: BLONDE,
        title: "Blonde",
        artist: "Frank Ocean",
        cover: "https://covers/Blonde.jpg",
        year: "2016",
        reason: "You played it 34 times",
        hits: [{ title: "Nikes", share: 0, biggest: false }],
        hitsByPlays: false,
      },
      {
        mbid: DAMN,
        title: "DAMN.",
        artist: "Kendrick Lamar",
        cover: "https://covers/DAMN..jpg",
        year: "2017",
        reason: "From your listening",
        hits: [],
        hitsByPlays: false,
      },
    ]);
    expect(db.fake.callsOn("rpc:diary_to_rate")[0]?.args).toEqual([
      "diary_to_rate",
      { p_limit: 10 },
    ]);
    expect(db.fake.callsOn("releases").find((call) => call.method === "in")?.args).toEqual([
      "mbid",
      [BLONDE, DAMN],
    ]);
  });

  it("writes big counts the way the rest of the site does", async () => {
    db.fake.answer("rpc:diary_to_rate", {
      data: [{ release_mbid: BLONDE, plays: 1204, minutes: 4000, last_day: "2026-10-12" }],
      error: null,
    });
    db.fake.answer("releases", {
      data: [release(BLONDE, "Blonde", "Frank Ocean", null)],
      error: null,
    });
    const [card] = await getListeningStack(10);
    expect(card?.reason).toBe("You played it 1,204 times");
    expect(card?.year).toBeNull();
  });

  it("leaves out an album the catalogue no longer has", async () => {
    db.fake.answer("rpc:diary_to_rate", {
      data: [
        { release_mbid: BLONDE, plays: 3, minutes: 40, last_day: "2026-10-12" },
        { release_mbid: DAMN, plays: 2, minutes: 40, last_day: "2026-10-01" },
      ],
      error: null,
    });
    db.fake.answer("releases", {
      data: [release(DAMN, "DAMN.", "Kendrick Lamar", "2017-04-14")],
      error: null,
    });
    expect((await getListeningStack(10)).map((card) => card.mbid)).toEqual([DAMN]);
  });

  it("is empty before migration 0025, quietly", async () => {
    db.fake.answer("rpc:diary_to_rate", {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect(await getListeningStack(10)).toEqual([]);
    expect(db.fake.callsOn("releases")).toHaveLength(0);
    expect(logQueryError).not.toHaveBeenCalled();
  });

  it("is empty, and says why in the logs, when the read fails", async () => {
    db.fake.answer("rpc:diary_to_rate", {
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });
    expect(await getListeningStack(10)).toEqual([]);
    expect(logQueryError).toHaveBeenCalled();
  });

  it("is empty with nothing waiting", async () => {
    db.fake.answer("rpc:diary_to_rate", { data: [], error: null });
    expect(await getListeningStack(10)).toEqual([]);
    expect(db.fake.callsOn("releases")).toHaveLength(0);
  });
});

describe("listeningWaiting", () => {
  it("answers how many albums wait for a score", async () => {
    db.fake.answer("rpc:diary_waiting", { data: 48, error: null });
    expect(await listeningWaiting()).toBe(48);
  });

  it("answers 0 on any error, migration 0025 not run among them", async () => {
    db.fake.answer("rpc:diary_waiting", {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect(await listeningWaiting()).toBe(0);
    db.fake.answer("rpc:diary_waiting", { data: null, error: { message: "down" } });
    expect(await listeningWaiting()).toBe(0);
  });
});
