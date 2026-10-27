import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Words people write are checked before anything is saved: names, bios and
 * list titles must be clean; reviews, takes, descriptions and notes must be
 * respectful (swearing is fine there, slurs are not). The phone app calls the
 * same actions, so this covers both.
 */

const session = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  /** How many tables were queried: nothing is written when it stays 0. */
  queries: 0,
}));

/** A stand-in Supabase client: every query finds nothing. */
function emptyClient() {
  const result = { data: null, error: null, count: 0 };
  const query = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (key === "then") {
            return (resolve: (value: unknown) => void) => resolve({ ...result, data: [] });
          }
          if (key === "maybeSingle" || key === "single") return () => Promise.resolve(result);
          return () => query();
        },
      },
    );
  return {
    from: () => {
      session.queries += 1;
      return query();
    },
    // The rate limiter's own call is not a write.
    rpc: () => Promise.resolve({ data: true, error: null }),
    storage: { from: query },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => session.user),
  createClient: vi.fn(async () => emptyClient()),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => emptyClient()) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => emptyClient()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const USER = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const NOT_CLEAN = "Please choose something else.";
const NOT_RESPECTFUL = "Please keep it respectful.";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  session.user = { id: USER, email: "someone@example.com" };
  session.queries = 0;
});

describe("saveProfile", () => {
  const fine = { username: "alex", display_name: "Alex", bio: "I like records." };

  async function save(fields: Partial<typeof fine>) {
    const { saveProfile } = await import("@/app/profile/actions");
    return saveProfile({}, form({ ...fine, ...fields }));
  }

  it.each([
    ["username", { username: "fuckface" }],
    ["display name", { display_name: "sh1t" }],
    ["bio", { bio: "total faggot" }],
  ])("refuses a %s that isn't clean, and saves nothing", async (_name, fields) => {
    expect(await save(fields)).toEqual({ error: NOT_CLEAN });
    expect(session.queries).toBe(0);
  });

  it("saves clean words", async () => {
    const result = await save({});
    expect(result.error).not.toBe(NOT_CLEAN);
    expect(session.queries).toBeGreaterThan(0);
  });
});

describe("lists", () => {
  it("refuses a title that isn't clean", async () => {
    const { createList } = await import("@/app/lists/actions");
    expect(await createList({ title: "shit list" })).toEqual({ ok: false, error: NOT_CLEAN });
    expect(session.queries).toBe(0);
  });

  it("refuses a disrespectful description", async () => {
    const { createList } = await import("@/app/lists/actions");
    expect(await createList({ title: "Mine", description: "kike" })).toEqual({
      ok: false,
      error: NOT_RESPECTFUL,
    });
    expect(session.queries).toBe(0);
  });

  it("saves a description with everyday swearing", async () => {
    const { createList } = await import("@/app/lists/actions");
    const result = await createList({ title: "Mine", description: "fucking great" });
    expect(result).not.toEqual({ ok: false, error: NOT_RESPECTFUL });
    expect(session.queries).toBeGreaterThan(0);
  });

  it("refuses the same words when a list is edited", async () => {
    const { updateList } = await import("@/app/lists/actions");
    expect(await updateList(1, { title: "shit list", ranked: false })).toEqual({
      ok: false,
      error: NOT_CLEAN,
    });
    expect(await updateList(1, { title: "Mine", description: "kike", ranked: false })).toEqual({
      ok: false,
      error: NOT_RESPECTFUL,
    });
    expect(session.queries).toBe(0);
  });

  it("refuses a disrespectful note on an album", async () => {
    const { setListNote } = await import("@/app/lists/actions");
    expect(await setListNote(1, MBID, "kike")).toEqual({ ok: false, error: NOT_RESPECTFUL });
    expect(session.queries).toBe(0);
  });
});

describe("saveReview", () => {
  it("refuses a disrespectful review", async () => {
    const { saveReview } = await import("@/app/ratings/actions");
    expect(await saveReview("album", MBID, "n1gger")).toEqual({
      ok: false,
      error: NOT_RESPECTFUL,
    });
    expect(session.queries).toBe(0);
  });

  it("saves a review with everyday swearing", async () => {
    const { saveReview } = await import("@/app/ratings/actions");
    const result = await saveReview("album", MBID, "fucking great");
    expect(result).not.toEqual({ ok: false, error: NOT_RESPECTFUL });
    expect(session.queries).toBeGreaterThan(0);
  });
});

describe("postTake", () => {
  it("refuses a disrespectful take", async () => {
    const { postTake } = await import("@/app/versus/actions");
    expect(await postTake(1, "you are a faggot")).toEqual({ ok: false, error: NOT_RESPECTFUL });
    expect(session.queries).toBe(0);
  });
});
