import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrationSql } from "../scripts/local-db.mjs";

/**
 * Migration 0027, the word filter held by the database, replayed on an
 * in-memory Postgres. Signed in, nobody writes the words others read
 * themselves; everything else of their own stays theirs to change; the
 * service role (the website, after its checks) writes the words.
 */

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const NAS = "cfbc0924-0035-4d6c-8197-f024653af823";
const JAY = "f82bcf78-5b69-4622-a5ef-73800768d9ac";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const STILLMATIC = "8ddd27bd-16c5-4205-9eff-f55a2951802a";

const MATCHUP = "(select id from public.versus_matchups where day = '2026-11-01')";
const LIST = `(select id from public.lists where user_id = '${ME}')`;

/** Every column 0027 locks, as [table, column]. */
const LOCKED = [
  ["profiles", "username"],
  ["profiles", "display_name"],
  ["profiles", "bio"],
  ["ratings", "review"],
  ["artist_ratings", "review"],
  ["versus_takes", "body"],
  ["lists", "title"],
  ["lists", "description"],
  ["list_items", "note"],
] as const;

describe("0027 the words people write go in through the website", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${ME}'), ('${OTHER}');
      insert into public.profiles (id, username) values ('${ME}', 'fan'), ('${OTHER}', 'other');
      insert into public.artists (mbid, name) values ('${NAS}', 'Nas'), ('${JAY}', 'Jay-Z');
      insert into public.releases (mbid, title, artist_mbid) values
        ('${ILLMATIC}', 'Illmatic', '${NAS}'), ('${STILLMATIC}', 'Stillmatic', '${NAS}');
      insert into public.ratings (user_id, release_mbid, score) values ('${ME}', '${ILLMATIC}', 9);
      insert into public.artist_ratings (user_id, artist_mbid, score) values ('${ME}', '${NAS}', 9);
      insert into public.versus_matchups (day, left_artist_mbid, right_artist_mbid)
        values ('2026-11-01', '${NAS}', '${JAY}');
      insert into public.versus_votes (matchup_id, user_id, pick) values (${MATCHUP}, '${ME}', 'left');
      insert into public.lists (user_id, title) values ('${ME}', 'Mine');
      insert into public.list_items (list_id, release_mbid, position) values (${LIST}, '${ILLMATIC}', 1);
    `);
  });
  afterAll(() => db?.close());

  async function as<T>(user: string | null, sql: string): Promise<T[]> {
    await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ""}', false)`);
    await db.exec(`set role ${user ? "authenticated" : "anon"}`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  }

  async function asServer(sql: string) {
    await db.exec("set role service_role");
    try {
      await db.exec(sql);
    } finally {
      await db.exec("reset role");
    }
  }

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0027_words_through_the_website.sql"));
  });

  it("leaves no locked column writable by anybody signed in or out", async () => {
    const pairs = LOCKED.map(([table, column]) => `('${table}', '${column}')`).join(", ");
    const { rows } = await db.query(`
      select t.tbl, t.col, r.role, p.priv
      from (values ${pairs}) t(tbl, col)
      cross join (values ('anon'), ('authenticated')) r(role)
      cross join (values ('INSERT'), ('UPDATE')) p(priv)
      where has_column_privilege(r.role, format('public.%I', t.tbl), t.col, p.priv)
    `);
    expect(rows).toEqual([]);
  });

  it.each([
    ["a bio", `update public.profiles set bio = 'Unchecked.' where id = '${ME}'`],
    ["a username", `update public.profiles set username = 'unchecked' where id = '${ME}'`],
    ["a display name", `update public.profiles set display_name = 'Unchecked' where id = '${ME}'`],
    [
      "a profile written directly",
      `insert into public.profiles (id, username) values ('${ME}', 'again')
       on conflict (id) do update set username = excluded.username`,
    ],
    ["an album review", `update public.ratings set review = 'Unchecked.' where user_id = '${ME}'`],
    [
      "a rating made with a review",
      `insert into public.ratings (user_id, release_mbid, score, review)
       values ('${ME}', '${STILLMATIC}', 7, 'Unchecked.')`,
    ],
    [
      "an artist review",
      `update public.artist_ratings set review = 'Unchecked.' where user_id = '${ME}'`,
    ],
    [
      "a take",
      `insert into public.versus_takes (matchup_id, user_id, body)
       values (${MATCHUP}, '${ME}', 'Unchecked.')`,
    ],
    ["a new list", `insert into public.lists (user_id, title) values ('${ME}', 'Unchecked')`],
    ["a list's title", `update public.lists set title = 'Unchecked' where user_id = '${ME}'`],
    [
      "a list's description",
      `update public.lists set description = 'Unchecked.' where user_id = '${ME}'`,
    ],
    [
      "a note added with an album",
      `insert into public.list_items (list_id, release_mbid, position, note)
       values (${LIST}, '${STILLMATIC}', 2, 'Unchecked.')`,
    ],
    ["a note", `update public.list_items set note = 'Unchecked.' where list_id = ${LIST}`],
  ])("refuses %s written with a person's own session", async (_what, sql) => {
    await expect(as(ME, sql)).rejects.toThrow(/permission denied/);
  });

  it("lets them change everything else of their own, as before", async () => {
    // What PostgREST runs for the website's rate(): an upsert naming three columns.
    await as(
      ME,
      `insert into public.ratings (user_id, release_mbid, score) values ('${ME}', '${ILLMATIC}', 8)
       on conflict (user_id, release_mbid) do update
       set user_id = excluded.user_id, release_mbid = excluded.release_mbid, score = excluded.score`,
    );
    await as(
      ME,
      `insert into public.ratings (user_id, release_mbid, score) values ('${ME}', '${STILLMATIC}', 6)`,
    );
    await as(
      ME,
      `insert into public.artist_ratings (user_id, artist_mbid, score) values ('${ME}', '${NAS}', 7)
       on conflict (user_id, artist_mbid) do update
       set user_id = excluded.user_id, artist_mbid = excluded.artist_mbid, score = excluded.score`,
    );
    await as(
      ME,
      `update public.profiles set raised_era = '1990s', avatar_url = '/records/${ILLMATIC}'
       where id = '${ME}'`,
    );
    await as(
      ME,
      `update public.lists set ranked = true, updated_at = now() where user_id = '${ME}'`,
    );
    await as(
      ME,
      `insert into public.list_items (list_id, release_mbid, position)
       values (${LIST}, '${STILLMATIC}', 2)`,
    );
    await as(
      ME,
      `update public.list_items set position = 1
       where list_id = ${LIST} and release_mbid = '${STILLMATIC}'`,
    );
    await as(
      ME,
      `insert into public.follows (follower_id, following_id) values ('${ME}', '${OTHER}')`,
    );

    const { rows } = await db.query(`
      select
        (select score from public.ratings
          where user_id = '${ME}' and release_mbid = '${ILLMATIC}') as album,
        (select score from public.artist_ratings where user_id = '${ME}') as artist,
        (select raised_era from public.profiles where id = '${ME}') as era,
        (select ranked from public.lists where user_id = '${ME}') as ranked,
        (select position from public.list_items where release_mbid = '${STILLMATIC}') as position,
        (select count(*)::int from public.follows where follower_id = '${ME}') as follows
    `);
    expect(rows).toEqual([
      { album: 8, artist: 7, era: "1990s", ranked: true, position: 1, follows: 1 },
    ]);
  });

  it("lets the service role write the words, and anybody read them", async () => {
    await asServer(`
      update public.profiles set bio = 'Queensbridge.' where id = '${ME}';
      update public.ratings set review = 'Still the one.'
        where user_id = '${ME}' and release_mbid = '${ILLMATIC}';
      update public.artist_ratings set review = 'Top five.' where user_id = '${ME}';
      insert into public.versus_takes (matchup_id, user_id, body)
        values (${MATCHUP}, '${ME}', 'Illmatic alone.');
      update public.lists set title = 'Queensbridge', description = 'Where it started.'
        where user_id = '${ME}';
      insert into public.lists (user_id, title) values ('${OTHER}', 'Theirs');
      update public.list_items set note = 'Start here.' where release_mbid = '${ILLMATIC}';
    `);

    // Signed out: reading is untouched.
    expect(await as(null, `select bio from public.profiles where id = '${ME}'`)).toEqual([
      { bio: "Queensbridge." },
    ]);
    expect(
      await as(null, `select review from public.ratings where release_mbid = '${ILLMATIC}'`),
    ).toEqual([{ review: "Still the one." }]);
    expect(await as(null, "select review from public.artist_ratings")).toEqual([
      { review: "Top five." },
    ]);
    expect(await as(null, "select body from public.versus_takes")).toEqual([
      { body: "Illmatic alone." },
    ]);
    expect(await as(null, "select title, description from public.lists order by id")).toEqual([
      { title: "Queensbridge", description: "Where it started." },
      { title: "Theirs", description: null },
    ]);
    expect(
      await as(null, `select note from public.list_items where release_mbid = '${ILLMATIC}'`),
    ).toEqual([{ note: "Start here." }]);
  });

  it("still lets people delete their own take", async () => {
    await as(ME, `delete from public.versus_takes where user_id = '${ME}'`);
    expect(await as(null, "select body from public.versus_takes")).toEqual([]);
  });
});
