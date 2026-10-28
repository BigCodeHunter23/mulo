import { beforeEach, describe, expect, it, vi } from "vitest";

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const ARTICLE = "https://en.wikipedia.org/wiki/Queen_(band)";

const db = vi.hoisted(() => ({
  /** What the artists table answers for the columns asked for. */
  read: (() => ({ data: null, error: null })) as (columns: string) => {
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string } | null;
  },
  saved: [] as Record<string, unknown>[],
  /** What saving a row answers. */
  write: (() => ({ error: null })) as (row: Record<string, unknown>) => {
    error: { code?: string; message?: string } | null;
  },
  extras: { imageUrl: null, bio: null, bioUrl: null, answered: true } as {
    imageUrl: string | null;
    bio: string | null;
    bioUrl: string | null;
    answered: boolean;
  },
  musicbrainzAsked: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      let columns = "";
      const builder = {
        select: (wanted: string) => ((columns = wanted), builder),
        eq: () => builder,
        maybeSingle: async () => db.read(columns),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => (db.saved.push(row), db.write(row)),
    }),
  }),
}));
vi.mock("@/lib/musicbrainz", () => ({
  MbNotFoundError: class extends Error {},
  getArtist: async () => (
    (db.musicbrainzAsked += 1),
    { id: MBID, name: "Queen", disambiguation: "UK rock group", aliases: [] }
  ),
  wikidataQid: () => "Q15862",
  seedFrom: () => ({ seed_score: null, seed_votes: null, seed_source: null }),
  coverArtUrl: () => null,
  creditText: () => "",
  getArtistReleaseGroups: async () => [],
  getReleaseGroup: async () => null,
  getTracklist: async () => [],
}));
vi.mock("@/lib/wikidata", () => ({ getArtistExtras: async () => db.extras }));
vi.mock("@/lib/rate-limit", () => ({
  allowAddress: async () => true,
  RateLimitedError: class extends Error {},
}));

const row = (bio_url: string | null) => ({
  mbid: MBID,
  name: "Queen",
  image_url: "",
  bio: "Queen are a British rock band.",
  bio_url,
});

/** A fresh module each time: whether the column exists is kept per server. */
async function getCachedArtist(mbid: string) {
  vi.resetModules();
  return (await import("./catalog")).getCachedArtist(mbid);
}

beforeEach(() => {
  db.read = () => ({ data: null, error: null });
  db.saved = [];
  db.write = () => ({ error: null });
  db.extras = { imageUrl: null, bio: null, bioUrl: null, answered: true };
  db.musicbrainzAsked = 0;
});

describe("getCachedArtist and where the bio came from", () => {
  it("credits the Wikipedia article a cached bio came from, without asking again", async () => {
    db.read = () => ({ data: row(ARTICLE), error: null });
    expect((await getCachedArtist(MBID))?.bio_url).toBe(ARTICLE);
    expect(db.musicbrainzAsked).toBe(0);
  });

  it("credits nobody for a bio known not to be Wikipedia's", async () => {
    db.read = () => ({ data: row(""), error: null });
    expect((await getCachedArtist(MBID))?.bio_url).toBeNull();
    expect(db.musicbrainzAsked).toBe(0);
  });

  it("looks an artist up again once when its bio's source was never noted", async () => {
    db.read = () => ({ data: row(null), error: null });
    db.extras = { ...db.extras, bio: "Queen are a British rock band.", bioUrl: ARTICLE };
    expect((await getCachedArtist(MBID))?.bio_url).toBe(ARTICLE);
    expect(db.musicbrainzAsked).toBe(1);
    expect(db.saved[0]).toMatchObject({ bio_url: ARTICLE });
  });

  it("notes a bio from MusicBrainz as nobody's to credit", async () => {
    const artist = await getCachedArtist(MBID);
    expect(artist).toMatchObject({ bio: "UK rock group", bio_url: null });
    expect(db.saved[0]).toMatchObject({ bio_url: "" });
  });

  it("carries on without the column until migration 0022 has been run", async () => {
    db.read = (columns) =>
      columns.includes("bio_url")
        ? { data: null, error: { code: "42703", message: "column artists.bio_url does not exist" } }
        : { data: null, error: null };
    db.extras = { ...db.extras, bio: "Queen are a British rock band.", bioUrl: ARTICLE };
    const artist = await getCachedArtist(MBID);
    expect(artist?.name).toBe("Queen");
    expect(db.saved[0]).not.toHaveProperty("bio_url");
  });

  it("shows a cached artist as it was until then, without asking again", async () => {
    db.read = (columns) =>
      columns.includes("bio_url")
        ? { data: null, error: { code: "42703" } }
        : { data: { ...row(null), bio_url: undefined }, error: null };
    expect(await getCachedArtist(MBID)).toMatchObject({ name: "Queen", bio_url: null });
    expect(db.musicbrainzAsked).toBe(0);
  });

  it("keeps a cached artist as it was when Wikipedia doesn't answer, to look again later", async () => {
    db.read = () => ({ data: { ...row(null), image_url: "https://photo" }, error: null });
    db.extras = { ...db.extras, answered: false };
    expect(await getCachedArtist(MBID)).toMatchObject({
      image_url: "https://photo",
      bio: "Queen are a British rock band.",
    });
    expect(db.saved).toEqual([]);
  });

  it("saves without bio_url, seed and all, when the column turns out missing on saving", async () => {
    db.write = (saved) =>
      "bio_url" in saved
        ? { error: { code: "PGRST204", message: "Could not find the 'bio_url' column" } }
        : { error: null };
    await getCachedArtist(MBID);
    expect(db.saved).toHaveLength(2);
    expect(db.saved[1]).not.toHaveProperty("bio_url");
    expect(db.saved[1]).toHaveProperty("seed_score");
  });
});
