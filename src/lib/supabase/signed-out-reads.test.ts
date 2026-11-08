import { afterEach, describe, expect, it, vi } from "vitest";
import { asSignedOut, inSignedOutRead, watchedFetch } from "./signed-out-reads";

const answering = (status: number) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));

afterEach(() => vi.restoreAllMocks());

describe("asSignedOut", () => {
  it("is only in force inside the read", async () => {
    expect(inSignedOutRead()).toBe(false);
    const { value } = await asSignedOut(async () => inSignedOutRead());
    expect(value).toBe(true);
    expect(inSignedOutRead()).toBe(false);
  });

  it("reports nothing wrong when the database answers", async () => {
    answering(200);
    const { failed } = await asSignedOut(() => watchedFetch("https://db.test/rest"));
    expect(failed).toBe(false);
  });

  it("isn't troubled by a column a migration hasn't added yet", async () => {
    answering(400);
    const { failed } = await asSignedOut(() => watchedFetch("https://db.test/rest"));
    expect(failed).toBe(false);
  });

  it.each([402, 429, 500, 503])("notes when the database answers %i", async (status) => {
    answering(status);
    const { failed } = await asSignedOut(() => watchedFetch("https://db.test/rest"));
    expect(failed).toBe(true);
  });

  it("notes when the database can't be reached, and still lets the caller see why", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { value, failed } = await asSignedOut(() =>
      watchedFetch("https://db.test/rest").catch((error: Error) => error.message),
    );
    expect(value).toBe("offline");
    expect(failed).toBe(true);
  });

  it("keeps one read's trouble from another's", async () => {
    answering(500);
    await asSignedOut(() => watchedFetch("https://db.test/rest"));
    const { failed } = await asSignedOut(async () => "nothing asked");
    expect(failed).toBe(false);
  });

  it("does nothing outside a read but answer", async () => {
    answering(500);
    expect((await watchedFetch("https://db.test/rest")).status).toBe(500);
  });
});
