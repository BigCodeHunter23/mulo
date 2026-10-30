/**
 * Reading what another service sends without trusting its size: a body is
 * read only up to a limit, so a broken or hostile answer can't fill memory.
 */

/** Thrown when an answer is bigger than its reader allows. */
export class TooLargeError extends Error {
  constructor(what: string, max: number) {
    super(`${what} answered with more than ${max} bytes`);
    this.name = "TooLargeError";
  }
}

/**
 * A response's body, up to `max` bytes, or null past it. One that says it's
 * bigger isn't read at all, and one that turns out bigger is let go of as
 * soon as it passes the limit. No body reads as nothing.
 */
export async function readCapped(
  response: Response,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > max) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A JSON body up to `max` bytes; past it, a TooLargeError naming `what` answered. */
export async function readJsonCapped(
  response: Response,
  max: number,
  what: string,
): Promise<unknown> {
  const bytes = await readCapped(response, max);
  if (!bytes) throw new TooLargeError(what, max);
  return JSON.parse(new TextDecoder().decode(bytes));
}
