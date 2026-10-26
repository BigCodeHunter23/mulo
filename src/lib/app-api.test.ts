import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The app copies app-api.ts (`pnpm sync:web` in mulo-app), where Next,
 * Supabase and server-only code don't exist. Only types may cross, and only
 * from files the app copies too.
 */

const source = readFileSync(new URL("./app-api.ts", import.meta.url), "utf8");
const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm)];

/** Framework-free files the app copies alongside this one. */
const SHARED = [
  "@/lib/friend-scores",
  "@/lib/drop-lineup",
  "@/lib/rating-kinds",
  "@/lib/versus-shared",
];

describe("app-api.ts", () => {
  it("imports types only, and only from files the app also copies", () => {
    expect(imports.length).toBeGreaterThan(0);
    for (const [, typeOnly, from] of imports) {
      expect(typeOnly, from).toBeTruthy();
      expect(SHARED, from).toContain(from);
    }
  });

  it("has no runtime code", () => {
    expect(source).not.toMatch(/^export (const|function|class|async|default)/m);
  });
});
