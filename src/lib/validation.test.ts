import { describe, expect, it } from "vitest";
import { pageNumber } from "./validation";

describe("pageNumber", () => {
  it("reads a page from the address bar", () => {
    expect(pageNumber("2")).toBe(2);
    expect(pageNumber("40")).toBe(40);
  });

  it("falls back to the first page for anything else", () => {
    for (const value of [undefined, "", "0", "-1", "1.5", "02", "abc", "999999", "2; drop"]) {
      expect(pageNumber(value)).toBe(1);
    }
  });
});
