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

describe("0018 score totals", () => {
  let db: PGlite;
  const ARTIST = "11111111-1111-4111-8111-111111111111";
  const OTHER_ALBUM = "22222222-2222-4222-8222-222222222222";
  const SONG = "33333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    db = await localDatabase();
    // 1,500 people rate one album, more than the API's 1,000-row page.
    await db.exec(`
      insert into public.artists (mbid, name) values ('${ARTIST}', 'The Band');
      insert into public.releases (mbid, title, artist_mbid, release_date) values
        ('${ALBUM}', 'First', '${ARTIST}', '1994-04-19'),
        ('${OTHER_ALBUM}', 'Second', '${ARTIST}', '1996-07-02');
      insert into public.songs (mbid, title) values ('${SONG}', 'Opener');
      insert into auth.users (id)
        select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 1500) n;
      insert into public.profiles (id, username)
        select id, 'user_' || row_number() over () from auth.users;
      insert into public.ratings (user_id, release_mbid, score, created_at)
        select id, '${ALBUM}', case when right(id::text, 1) in ('0', '2', '4', '6', '8') then 8 else 6 end,
               now() - interval '20 days'
        from auth.users;
      insert into public.ratings (user_id, release_mbid, score) values ('${U(1)}', '${OTHER_ALBUM}', 10);
      insert into public.artist_ratings (user_id, artist_mbid, score) values ('${U(1)}', '${ARTIST}', 9), ('${U(2)}', '${ARTIST}', 7);
      insert into public.song_ratings (user_id, song_mbid, release_mbid, score) values
        ('${U(1)}', '${SONG}', '${OTHER_ALBUM}', 4),
        ('${U(2)}', '${SONG}', '${ALBUM}', 6);
    `);
  });
  afterAll(() => db?.close());

  const rows = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  it("count every rating on an album, past a thousand", async () => {
    const [album] = await rows<{ total: number; votes: number; average: number }>(
      "select total::int, votes::int, average from public.score_totals('album', $1)",
      [[ALBUM]],
    );
    expect(album).toEqual({ total: 1500 * 7, votes: 1500, average: 7 });
  });

  it("leave one person out for the crowd", async () => {
    const [album] = await rows<{ votes: number }>(
      "select votes::int from public.score_totals('album', $1, $2)",
      [[ALBUM], U(1)],
    );
    expect(album.votes).toBe(1499);
  });

  it("give totals per kind, and everything of a kind without a list", async () => {
    expect(
      await rows("select mbid, votes::int, average from public.score_totals('artist')"),
    ).toEqual([{ mbid: ARTIST, votes: 2, average: 8 }]);
    expect(await rows("select mbid, votes::int from public.score_totals('song', $1)", [[SONG]])).toEqual([
      { mbid: SONG, votes: 2 },
    ]);
    expect(await rows("select mbid from public.score_totals('album') order by mbid")).toHaveLength(2);
  });

  it("give chart rows with the artist joined, and songs on the album first rated on", async () => {
    expect(
      await rows("select mbid, title, artist_name, votes::int from public.album_chart_rows() order by votes desc"),
    ).toEqual([
      { mbid: ALBUM, title: "First", artist_name: "The Band", votes: 1500 },
      { mbid: OTHER_ALBUM, title: "Second", artist_name: "The Band", votes: 1 },
    ]);
    expect(await rows("select mbid, release_mbid, total::int, votes::int from public.song_chart_rows()")).toEqual([
      { mbid: SONG, release_mbid: OTHER_ALBUM, total: 10, votes: 2 },
    ]);
    expect(await rows("select name, total::int from public.artist_chart_rows()")).toEqual([
      { name: "The Band", total: 16 },
    ]);
  });

  it("rank an artist's songs", async () => {
    expect(await rows("select title, release_title, average, votes::int from public.artist_top_songs($1)", [ARTIST])).toEqual([
      { title: "Opener", release_title: "Second", average: 5, votes: 2 },
    ]);
  });

  it("count somebody's ratings of every kind", async () => {
    expect(await rows("select ratings::int, average from public.profile_rating_stats($1)", [U(1)])).toEqual([
      { ratings: 4, average: (6 + 10 + 9 + 4) / 4 },
    ]);
  });

  it("rank heavy rotation by people, and count who was active", async () => {
    // This week: one person rated the second album and a song on it, another
    // rated a song on the first. The first album's own ratings are older.
    expect(
      await rows(
        "select release_mbid, people::int, ratings::int, everyone::int, albums::int from public.heavy_rotation(now() - interval '7 days')",
      ),
    ).toEqual([
      { release_mbid: OTHER_ALBUM, people: 1, ratings: 2, everyone: 2, albums: 2 },
      { release_mbid: ALBUM, people: 1, ratings: 1, everyone: 2, albums: 2 },
    ]);
    const month = await rows<{ release_mbid: string; people: number }>(
      "select release_mbid, people::int from public.heavy_rotation(now() - interval '30 days', 1)",
    );
    expect(month).toEqual([{ release_mbid: ALBUM, people: 1500 }]);
  });
});
