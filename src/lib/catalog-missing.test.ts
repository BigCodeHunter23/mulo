import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../test/fake-supabase";

const mb = vi.hoisted(() => ({
  NotFound: class extends Error {},
  getArtist: vi.fn(),
  getReleaseGroup: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/musicbrainz", () => ({
  MbNotFoundError: mb.NotFound,
  getArtist: mb.getArtist,
  getReleaseGroup: mb.getReleaseGroup,
  wikidataQid: () => null,
  seedFrom: () => ({}),
  coverArtUrl: (id: string) => `https://coverartarchive.org/release-group/${id}/front-500`,
  creditText: () => null,
  getArtistReleaseGroups: vi.fn(),
  getTracklist: vi.fn(),
}));
vi.mock("@/lib/wikidata", () => ({ getArtistExtras: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  allowAddress: vi.fn(async () => true),
  RateLimitedError: class extends Error {},
}));

import { getCachedArtist, getCachedRelease } from "@/lib/catalog";
import { forgetMissing } from "@/lib/missing-mbids";
import { allowAddress } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MADE_UP = "00000000-0000-4000-8000-0000000000ff";

let reader: FakeSupabase;
beforeEach(() => {
  forgetMissing();
  reader = fakeSupabase();
  reader.answer("artists", { data: null, error: null });
  reader.answer("releases", { data: null, error: null });
  vi.mocked(createClient).mockResolvedValue(reader.client as never);
  vi.mocked(createAdminClient).mockReturnValue(fakeSupabase().client as never);
  vi.mocked(allowAddress).mockClear();
  mb.getArtist.mockReset().mockRejectedValue(new mb.NotFound());
  mb.getReleaseGroup.mockReset().mockRejectedValue(new mb.NotFound());
});

describe("an id MusicBrainz doesn't have", () => {
  it("is only asked about once for an album", async () => {
    expect(await getCachedRelease(MADE_UP)).toBeNull();
    expect(await getCachedRelease(MADE_UP)).toBeNull();
    expect(mb.getReleaseGroup).toHaveBeenCalledTimes(1);
    expect(allowAddress).toHaveBeenCalledTimes(1);
  });

  it("is only asked about once for an artist", async () => {
    expect(await getCachedArtist(MADE_UP)).toBeNull();
    expect(await getCachedArtist(MADE_UP)).toBeNull();
    expect(mb.getArtist).toHaveBeenCalledTimes(1);
    expect(allowAddress).toHaveBeenCalledTimes(1);
  });

  it("isn't remembered when MusicBrainz only failed", async () => {
    mb.getReleaseGroup.mockRejectedValue(new Error("MusicBrainz is down"));
    await expect(getCachedRelease(MADE_UP)).rejects.toThrow();
    await expect(getCachedRelease(MADE_UP)).rejects.toThrow();
    expect(mb.getReleaseGroup).toHaveBeenCalledTimes(2);
  });
});
