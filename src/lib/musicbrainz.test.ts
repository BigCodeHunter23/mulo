import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

/** A fresh module each time, so MusicBrainz's one-a-second queue starts empty. */
async function fresh() {
  vi.resetModules();
  return import("@/lib/musicbrainz");
}

function answering(status: number, body: unknown) {
  const fetcher = vi.fn(
    async (_input: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
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
