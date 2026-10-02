import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImage, isAllowedImageUrl } from "./image-fetch";

describe("fetchImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (routes: Record<string, () => Response>) => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return routes[url]?.() ?? new Response("missing", { status: 404 });
      }),
    );
    return calls;
  };

  const COVER = "https://coverartarchive.org/release-group/x/front-500";

  it("follows a redirect between allowed hosts", async () => {
    respond({
      [COVER]: () =>
        new Response(null, {
          status: 307,
          headers: { location: "https://archive.org/download/x.jpg" },
        }),
      "https://archive.org/download/x.jpg": () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { "content-type": "image/jpeg" },
        }),
    });
    const image = await fetchImage(COVER);
    expect(image?.type).toBe("image/jpeg");
    expect(image?.url).toBe("https://archive.org/download/x.jpg");
  });

  it("won't follow a redirect anywhere else", async () => {
    const calls = respond({
      [COVER]: () =>
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
    });
    expect(await fetchImage(COVER)).toBeNull();
    expect(calls).toEqual([COVER]);
  });

  it("never asks a host that isn't allowed", async () => {
    const calls = respond({});
    expect(await fetchImage("https://evil.example/pixel.png")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("refuses SVG and anything that isn't a picture", async () => {
    respond({
      [COVER]: () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    });
    expect(await fetchImage(COVER)).toBeNull();
    respond({
      [COVER]: () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    });
    expect(await fetchImage(COVER)).toBeNull();
  });

  it("refuses anything too big, declared or not", async () => {
    respond({
      [COVER]: () =>
        new Response("x", {
          headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024) },
        }),
    });
    expect(await fetchImage(COVER)).toBeNull();

    respond({
      [COVER]: () =>
        new Response(new Uint8Array(6 * 1024 * 1024), { headers: { "content-type": "image/png" } }),
    });
    expect(await fetchImage(COVER)).toBeNull();
  });
});

const OWN = ["mulo-plum.vercel.app", "abcdefgh.supabase.co"];

describe("isAllowedImageUrl", () => {
  it.each([
    "https://coverartarchive.org/release-group/0383dadf-2a4e-4d10-a46a-e9e041da8eb3/front-500",
    "https://archive.org/download/mbid-x/mbid-x-123_thumb500.jpg",
    "https://ia800500.us.archive.org/1/items/mbid-x/x_thumb500.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Nas.jpg?width=500",
    "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nas.jpg",
    "https://abcdefgh.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg?v=1",
    "https://mulo-plum.vercel.app/records/0383dadf-2a4e-4d10-a46a-e9e041da8eb3?s=256",
  ])("allows %s", (url) => {
    expect(isAllowedImageUrl(url, OWN)).toBe(true);
  });

  it.each([
    ["another site", "https://evil.example/pixel.png"],
    ["a look-alike host", "https://coverartarchive.org.evil.example/x.jpg"],
    ["a host ending in an allowed name", "https://notarchive.org/x.jpg"],
    ["plain http elsewhere", "http://upload.wikimedia.org/x.jpg"],
    ["an odd port", "https://upload.wikimedia.org:8443/x.jpg"],
    ["credentials", "https://user:pass@upload.wikimedia.org/x.jpg"],
    ["another Supabase project", "https://someoneelse.supabase.co/storage/v1/object/public/x.jpg"],
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["localhost", "http://localhost:3000/records/x"],
    ["a data URI", "data:image/svg+xml;base64,PHN2Zz4="],
    ["a file path", "file:///etc/passwd"],
    ["not a URL", "/records/x"],
  ])("refuses %s", (_label, url) => {
    expect(isAllowedImageUrl(url, OWN)).toBe(false);
  });
});
