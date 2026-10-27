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
  "@/lib/badge-catalog",
  "@/lib/friend-scores",
  "@/lib/drop-lineup",
  "@/lib/eras",
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

  it("has no runtime code beyond plain strings the app matches on", () => {
    expect(source).not.toMatch(/^export (function|class|async|default|let|var)/m);
    // One line each, a string and nothing else, so the app's copy has nothing to run.
    const constants = source.split(/\r?\n/).filter((line) => line.startsWith("export const "));
    for (const line of constants) {
      expect(line).toMatch(/^export const [A-Z_]+ = "[^"\\]*";$/);
    }
    expect(source).not.toMatch(/^(const|let|var|function|class) /m);
  });

  it("holds the words the app compares an answer with", async () => {
    const { NOT_FRESH } = await import("./app-api");
    expect(NOT_FRESH).toBe("Please confirm it's you again.");
  });
});
