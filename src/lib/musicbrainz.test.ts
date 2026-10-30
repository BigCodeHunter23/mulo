import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

/** A fresh module each time, so MusicBrainz's one-a-second queue starts empty. */
async function fresh() {
  vi.resetModules();
  return import("@/lib/musicbrainz");
}

function answering(status: number, body: unknown) {
  const fetcher = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("getReleaseGroupBrief", () => {
  it("asks for one album with its credits", async () => {
    const fetcher = answering(200, { id: "g", title: "CHROMAKOPIA", "primary-type": "Album" });
    const { getReleaseGroupBrief } = await fresh();
    expect(await getReleaseGroupBrief("g")).toMatchObject({ title: "CHROMAKOPIA" });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://musicbrainz.org/ws/2/release-group/g?inc=artists&fmt=json",
    );
  });

  it("says when MusicBrainz has no such album", async () => {
    answering(404, {});
    const { getReleaseGroupBrief, MbNotFoundError } = await fresh();
    await expect(getReleaseGroupBrief("g")).rejects.toBeInstanceOf(MbNotFoundError);
  });
});

describe("getArtistReleaseGroups", () => {
  it("reads EPs when asked, leaving out any with a secondary type", async () => {
    const fetcher = answering(200, {
      "release-groups": [
        { id: "a", title: "Cherry Bomb + Instrumentals", "secondary-types": [] },
        { id: "b", title: "Live EP", "secondary-types": ["Live"] },
      ],
      "release-group-count": 2,
    });
    const { getArtistReleaseGroups } = await fresh();
    expect((await getArtistReleaseGroups("t", "ep")).map((g) => g.id)).toEqual(["a"]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/release-group?artist=t&type=ep&");
  });

  it("reads albums by default", async () => {
    const fetcher = answering(200, { "release-groups": [], "release-group-count": 0 });
    const { getArtistReleaseGroups } = await fresh();
    await getArtistReleaseGroups("t");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("type=album");
  });
});
