import { describe, expect, it, vi } from "vitest";
import { PAGE_SIZE, readAll } from "./read-all";

/** A table of `count` rows behind an API that never returns more than a page. */
function table(count: number) {
  const rows = Array.from({ length: count }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to, from + PAGE_SIZE - 1) + 1),
    error: null,
  }));
}

describe("readAll", () => {
  it("reads past the API's page", async () => {
    const page = table(2500);
    const { data, error } = await readAll(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(data.at(-1)).toBe(2499);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it("asks once when everything fits", async () => {
    const page = table(10);
    expect((await readAll(page)).data).toHaveLength(10);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("asks again when the last page was exactly full", async () => {
    const page = table(PAGE_SIZE);
    expect((await readAll(page)).data).toHaveLength(PAGE_SIZE);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("stops at the cap", async () => {
    const page = table(5000);
    const { data } = await readAll(page, 1500);
    expect(data).toHaveLength(1500);
    expect(page).toHaveBeenLastCalledWith(1000, 1499);
  });

  it("hands back an error with what came before it", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(PAGE_SIZE).fill(1), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { data, error } = await readAll<number>(page);
    expect(error).toEqual({ message: "boom" });
    expect(data).toHaveLength(PAGE_SIZE);
  });
});
