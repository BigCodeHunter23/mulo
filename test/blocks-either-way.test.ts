import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { localDatabase } from "../scripts/local-db.mjs";

/** The condition push's blockedEitherWay() sends, run against the real blocks table. */

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("blocks, read in either direction", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
      insert into public.profiles (id, username) values
        ('${U(1)}', 'one'), ('${U(2)}', 'two'), ('${U(3)}', 'three');
      insert into public.blocks (blocker_id, blocked_id) values ('${U(1)}', '${U(2)}');
    `);
  });
  afterAll(() => db?.close());

  const blocked = async (a: string, b: string) =>
    (
      await db.query(
        `select 1 from public.blocks
         where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)
         limit 1`,
        [a, b],
      )
    ).rows.length > 0;

  it("finds a block whichever of the two made it", async () => {
    expect(await blocked(U(1), U(2))).toBe(true);
    expect(await blocked(U(2), U(1))).toBe(true);
  });

  it("finds nothing between people who never blocked each other", async () => {
    expect(await blocked(U(1), U(3))).toBe(false);
    expect(await blocked(U(3), U(2))).toBe(false);
  });
});
