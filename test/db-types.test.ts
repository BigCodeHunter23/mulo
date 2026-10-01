import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { localDatabase } from "../scripts/local-db.mjs";
import { generateTypes, TYPES_FILE } from "../scripts/gen-db-types.mjs";

it("the checked-in database types match the migrations (run `npm run db:types` if not)", async () => {
  const db = await localDatabase();
  try {
    const fresh = await generateTypes(db);
    const current = readFileSync(TYPES_FILE, "utf8").replace(/\r\n/g, "\n");
    expect(current).toBe(fresh);
  } finally {
    await db.close();
  }
});
