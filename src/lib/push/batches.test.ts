import { describe, expect, it, vi } from "vitest";
import { batchesOf, pastDeadline } from "@/lib/push/batches";

describe("batchesOf", () => {
  it("fills each batch up to the limit, in order", () => {
    expect(batchesOf([1, 2, 3, 4, 5], (n) => n, 5)).toEqual([[1, 2], [3], [4], [5]]);
    expect(batchesOf(["a", "b", "c"], () => 1, 2)).toEqual([["a", "b"], ["c"]]);
  });

  it("gives an item heavier than the limit a batch of its own", () => {
    expect(batchesOf([1, 9, 1], (n) => n, 5)).toEqual([[1], [9], [1]]);
  });

  it("answers no batches for nothing", () => {
    expect(batchesOf([], () => 1, 5)).toEqual([]);
  });
});

describe("pastDeadline", () => {
  it("is never past without a deadline", () => {
    expect(pastDeadline(undefined)).toBe(false);
  });

  it("is past once the clock reaches it", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    expect(pastDeadline(1001)).toBe(false);
    expect(pastDeadline(1000)).toBe(true);
  });
});
