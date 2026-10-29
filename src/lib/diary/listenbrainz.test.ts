import { describe, expect, it, vi } from "vitest";
import { groupsOf, lookupRecordings } from "./listenbrainz";

const reply = (body: unknown, status = 200) =>
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );

describe("lookupRecordings", () => {
  it("asks fifty at a time with the token, keeping the order", async () => {
    const fetcher = reply(
      Array.from({ length: 50 }, (_, index) => ({
        index,
        recording_mbid: `r${index}`,
        release_mbid: "x",
        release_name: "Blonde",
      })),
    );
    const items = Array.from({ length: 60 }, (_, i) => ({
      artist: "A",
      album: "Blonde",
      song: `S${i}`,
    }));
    const hits = await lookupRecordings(items, "TOKEN", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Token TOKEN" }),
      }),
    );
    expect(hits[0]).toEqual({ recording: "r0", releaseName: "Blonde" });
  });

  it("answers null for no match, and keeps names within 250 characters", async () => {
    const fetcher = reply([{ index: 0 }]);
    const hits = await lookupRecordings(
      [{ artist: "A".repeat(200), album: "B".repeat(200), song: "C" }],
      "T",
      fetcher,
    );
    expect(hits).toEqual([null]);
    const sent = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const item = sent.recordings[0];
    expect(
      item.artist_name.length + item.recording_name.length + item.release_name.length,
    ).toBeLessThanOrEqual(250);
  });

  it("fails when ListenBrainz does", async () => {
    await expect(
      lookupRecordings([{ artist: "A", album: "B", song: "C" }], "T", reply({}, 503)),
    ).rejects.toThrow(/503/);
  });
});

describe("groupsOf", () => {
  it("reads each recording's album", async () => {
    const fetcher = reply({
      r1: {
        release: { release_group_mbid: "g1", name: "Blonde", album_artist_name: "Frank Ocean" },
      },
      r2: { recording: { name: "No release" } },
    });
    expect(await groupsOf(["r1", "r2"], fetcher)).toEqual(
      new Map([["r1", { group: "g1", title: "Blonde", artist: "Frank Ocean" }]]),
    );
    const sent = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(sent).toEqual({ recording_mbids: ["r1", "r2"], inc: "release" });
  });

  it("asks a hundred at a time", async () => {
    const fetcher = reply({});
    await groupsOf(
      Array.from({ length: 150 }, (_, i) => `r${i}`),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
