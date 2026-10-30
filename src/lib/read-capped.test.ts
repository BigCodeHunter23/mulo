import { describe, expect, it } from "vitest";
import { readCapped, readJsonCapped, TooLargeError } from "@/lib/read-capped";

/** A body sent in pieces, with no length declared, counting what's read of it. */
function streamed(pieces: string[]) {
  const sent = { pieces: 0 };
  const encoder = new TextEncoder();
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const piece = pieces[next++];
      if (piece === undefined) return controller.close();
      sent.pieces += 1;
      controller.enqueue(encoder.encode(piece));
    },
  });
  return { response: new Response(body), sent };
}

describe("readCapped", () => {
  it("reads a body up to the limit", async () => {
    const { response } = streamed(["ab", "cd"]);
    expect(new TextDecoder().decode((await readCapped(response, 4)) ?? undefined)).toBe("abcd");
  });

  it("stops reading past the limit", async () => {
    const { response, sent } = streamed(["abc", "def", "ghi", "jkl"]);
    expect(await readCapped(response, 5)).toBeNull();
    expect(sent.pieces).toBeLessThan(4);
  });

  it("doesn't read a body that says it's too big", async () => {
    const { response, sent } = streamed(["abc"]);
    const declared = new Response(response.body, { headers: { "content-length": "100" } });
    expect(await readCapped(declared, 10)).toBeNull();
    expect(sent.pieces).toBe(0);
  });

  it("reads no body as nothing", async () => {
    expect(await readCapped(new Response(null), 10)).toEqual(new Uint8Array(0));
  });
});

describe("readJsonCapped", () => {
  it("parses JSON within the limit, and throws past it", async () => {
    expect(await readJsonCapped(new Response('{"a":1}'), 100, "Somebody")).toEqual({ a: 1 });
    const big = readJsonCapped(new Response(`"${"x".repeat(200)}"`), 100, "Somebody");
    await expect(big).rejects.toBeInstanceOf(TooLargeError);
    await expect(
      readJsonCapped(new Response(`"${"x".repeat(200)}"`), 100, "Somebody"),
    ).rejects.toThrow("Somebody answered with more than 100 bytes");
  });
});
