import { beforeEach, describe, expect, it } from "vitest";
import { forgetMissing, isMissing, MISSING_FOR_MS, noteMissing } from "./missing-mbids";

const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(forgetMissing);

describe("names MusicBrainz doesn't have", () => {
  it("knows nothing at first", () => {
    expect(isMissing(ID)).toBe(false);
  });

  it("remembers one for a while, then asks again", () => {
    noteMissing(ID, 1_000);
    expect(isMissing(ID, 1_000 + MISSING_FOR_MS - 1)).toBe(true);
    expect(isMissing(ID, 1_000 + MISSING_FOR_MS)).toBe(false);
  });

  it("keeps a bounded number, so made-up ids can't fill the memory", () => {
    for (let i = 0; i <= 2_000; i += 1) noteMissing(`id-${i}`, 1_000);
    expect(isMissing("id-0", 1_001)).toBe(false);
    expect(isMissing("id-2000", 1_001)).toBe(true);
  });
});
