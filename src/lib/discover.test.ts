import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: <T>(run: T) => run }));

import { createPublicClient } from "@/lib/supabase/public";
import { newReleases } from "@/lib/discover";

const IGOR = {
  mbid: "8ddd27bd-16c5-4205-9eff-f55a2951802a",
  title: "IGOR",
  artist_credit: "Tyler, the Creator",
  cover_art_url: "https://coverartarchive.org/release-group/x/front-500",
  release_date: "2026-10-28",
  artists: { name: "Tyler, the Creator" },
};
const IGOR_SUMMARY = {
  mbid: IGOR.mbid,
  title: "IGOR",
  artist: "Tyler, the Creator",
  cover_art_url: IGOR.cover_art_url,
  year: "2026",
};

let fake: FakeSupabase;
beforeEach(() => {
  fake = fakeSupabase();
  vi.mocked(createPublicClient).mockReturnValue(fake.client as never);
});

describe("newReleases", () => {
  it("keeps to albums, leaving EPs out, as an artist's albums row does", async () => {
    fake.answer("releases", { data: [IGOR], error: null });
    expect(await newReleases()).toEqual([IGOR_SUMMARY]);
    expect(fake.callsOn("releases")).toContainEqual({
      table: "releases",
      method: "or",
      args: ["kind.is.null,kind.eq.album"],
    });
  });

  it("is every release before migration 0026, which tells albums from EPs", async () => {
    fake.answer(
      "releases",
      { data: null, error: { code: "42703", message: "column releases.kind does not exist" } },
      { data: [IGOR], error: null },
    );
    expect(await newReleases()).toEqual([IGOR_SUMMARY]);
    const reads = fake.callsOn("releases").filter((c) => c.method === "from");
    expect(reads).toHaveLength(2);
  });
});
