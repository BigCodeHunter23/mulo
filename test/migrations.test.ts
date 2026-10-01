import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrationFiles, migrationSql } from "../scripts/local-db.mjs";

/**
 * The migrations, replayed on an in-memory Postgres. The owner runs each one
 * by hand in the Supabase SQL editor, so every one from 0008 on has to be safe
 * to run twice, and the rules they add have to hold.
 */

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const ALBUM = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";

async function refuses(db: PGlite, sql: string) {
  await expect(db.exec(sql)).rejects.toThrow();
}

describe("0016 and 0017 over existing data", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase({ before: "0016" });
    // Rows that break 0016's rules, as an older database might hold.
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
      insert into public.profiles (id, username, avatar_url) values
        ('${U(1)}', 'Alex', 'https://evil.example/pixel.png'),
        ('${U(2)}', 'alex', null),
        ('${U(3)}', 'fine_user', '/records/${ALBUM}');
    `);
    for (const name of migrationFiles().filter((f) => f >= "0016")) {
      await db.exec(migrationSql(name));
    }
  });
  afterAll(() => db?.close());

  const validated = async (name: string) =>
    (
      await db.query<{ convalidated: boolean }>(
        "select convalidated from pg_constraint where conname = $1",
        [name],
      )
    ).rows[0]?.convalidated;
  const hasIndex = async (name: string) =>
    (await db.query("select 1 from pg_indexes where indexname = $1", [name])).rows.length === 1;

  it("leave a rule unvalidated where old rows break it, and validate the rest", async () => {
    expect(await validated("profiles_avatar_url_source")).toBe(false);
    expect(await validated("profiles_username_format")).toBe(true);
    expect(await validated("ratings_review_length")).toBe(true);
  });

  it("skip the case-insensitive username index while Alex and alex clash", async () => {
    expect(await hasIndex("profiles_username_lower_key")).toBe(false);
  });

  it("hold new writes to the rules even while old rows aren't", async () => {
    await refuses(db, `update public.profiles set avatar_url = 'https://evil.example/x.png' where id = '${U(3)}'`);
    await refuses(db, `update public.profiles set username = 'no spaces' where id = '${U(3)}'`);
    await refuses(db, `update public.profiles set bio = repeat('x', 301) where id = '${U(3)}'`);
    await db.exec(
      `update public.profiles set avatar_url = 'https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/avatars/${U(3)}/avatar.jpg?v=1727000000000' where id = '${U(3)}'`,
    );
  });

  it("add the index and validate the rule on a rerun once the rows are fixed", async () => {
    await db.exec(`
      update public.profiles set username = 'alex_two', avatar_url = null where id = '${U(2)}';
      update public.profiles set avatar_url = null where id = '${U(1)}';
    `);
    await db.exec(migrationSql("0016_profile_and_content_rules.sql"));
    expect(await hasIndex("profiles_username_lower_key")).toBe(true);
    expect(await validated("profiles_avatar_url_source")).toBe(true);
    await refuses(db, `insert into auth.users (id) values ('${U(4)}'); insert into public.profiles (id, username) values ('${U(4)}', 'ALEX')`);
  });

  it("accept a report with a known reason and refuse a made-up one", async () => {
    await db.exec(
      `insert into public.reports (reporter_id, reported_profile_id, reason) values ('${U(1)}', '${U(3)}', 'Spam or advertising')`,
    );
    await refuses(
      db,
      `insert into public.reports (reporter_id, reported_profile_id, reason) values ('${U(3)}', '${U(1)}', 'made up')`,
    );
  });

  it("count rate-limit hits per subject and refuse past the limit", async () => {
    const hit = async (subject: string) =>
      (
        await db.query<{ allowed: boolean }>(
          "select public.rate_limit_hit('login', $1, 3, 60) as allowed",
          [subject],
        )
      ).rows[0].allowed;
    expect([await hit("1.2.3.4"), await hit("1.2.3.4"), await hit("1.2.3.4"), await hit("1.2.3.4")]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(await hit("5.6.7.8")).toBe(true);
  });

  it("let only the service role use the rate limiter", async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      select has_function_privilege('anon', 'public.rate_limit_hit(text,text,integer,integer)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.rate_limit_hit(text,text,integer,integer)', 'execute') as authed,
             has_function_privilege('service_role', 'public.rate_limit_hit(text,text,integer,integer)', 'execute') as service,
             has_table_privilege('anon', 'public.rate_limits', 'select') as anon_read`);
    expect(rows[0]).toEqual({ anon: false, authed: false, service: true, anon_read: false });
  });
});

describe("every migration from 0008 on", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await localDatabase();
  });
  afterAll(() => db?.close());

  // 0001 to 0007 predate the rule and aren't safe to repeat.
  it.each(migrationFiles().filter((name) => name >= "0008"))("%s is safe to run twice", async (name) => {
    await db.exec(migrationSql(name));
  });
});
