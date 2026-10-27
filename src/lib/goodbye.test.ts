import { describe, expect, it } from "vitest";
import { goodbyeKind } from "@/lib/goodbye";

describe("goodbyeKind", () => {
  it("reads the two goodbyes deleting an account sends", () => {
    expect(goodbyeKind("1")).toBe("plain");
    expect(goodbyeKind("apple")).toBe("apple");
  });

  it("shows nothing for anything else, so a link can't fake a goodbye's wording", () => {
    for (const value of [undefined, "", "0", "Apple", "yes", ["1"], ["apple", "1"]]) {
      expect(goodbyeKind(value)).toBeNull();
    }
  });
});
