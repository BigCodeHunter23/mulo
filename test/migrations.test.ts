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
    await refuses(
      db,
      `update public.profiles set avatar_url = 'https://evil.example/x.png' where id = '${U(3)}'`,
    );
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
    await refuses(
      db,
      `insert into auth.users (id) values ('${U(4)}'); insert into public.profiles (id, username) values ('${U(4)}', 'ALEX')`,
    );
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
    expect([
      await hit("1.2.3.4"),
      await hit("1.2.3.4"),
      await hit("1.2.3.4"),
      await hit("1.2.3.4"),
    ]).toEqual([true, true, true, false]);
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
  it.each(migrationFiles().filter((name) => name >= "0008"))(
    "%s is safe to run twice",
    async (name) => {
      await db.exec(migrationSql(name));
    },
  );
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

  const rows = async <T>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

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
    expect(
      await rows("select mbid, votes::int from public.score_totals('song', $1)", [[SONG]]),
    ).toEqual([{ mbid: SONG, votes: 2 }]);
    expect(await rows("select mbid from public.score_totals('album') order by mbid")).toHaveLength(
      2,
    );
  });

  it("give chart rows with the artist joined, and songs on the album first rated on", async () => {
    expect(
      await rows(
        "select mbid, title, artist_name, votes::int from public.album_chart_rows() order by votes desc",
      ),
    ).toEqual([
      { mbid: ALBUM, title: "First", artist_name: "The Band", votes: 1500 },
      { mbid: OTHER_ALBUM, title: "Second", artist_name: "The Band", votes: 1 },
    ]);
    expect(
      await rows("select mbid, release_mbid, total::int, votes::int from public.song_chart_rows()"),
    ).toEqual([{ mbid: SONG, release_mbid: OTHER_ALBUM, total: 10, votes: 2 }]);
    expect(await rows("select name, total::int from public.artist_chart_rows()")).toEqual([
      { name: "The Band", total: 16 },
    ]);
  });

  it("rank an artist's songs", async () => {
    expect(
      await rows(
        "select title, release_title, average, votes::int from public.artist_top_songs($1)",
        [ARTIST],
      ),
    ).toEqual([{ title: "Opener", release_title: "Second", average: 5, votes: 2 }]);
  });

  it("count somebody's ratings of every kind", async () => {
    expect(
      await rows("select ratings::int, average from public.profile_rating_stats($1)", [U(1)]),
    ).toEqual([{ ratings: 4, average: (6 + 10 + 9 + 4) / 4 }]);
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

describe("0019 search indexes", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await localDatabase();
  });
  afterAll(() => db?.close());

  it("index every column search matches inside", async () => {
    const { rows } = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname like '%_trgm_idx' order by indexname",
    );
    expect(rows.map((row) => row.indexname)).toEqual([
      "artists_name_trgm_idx",
      "artists_search_names_trgm_idx",
      "releases_artist_credit_trgm_idx",
      "releases_title_trgm_idx",
      "tracks_title_trgm_idx",
    ]);
  });

  it("are used for a match anywhere in a name", async () => {
    await db.exec("set enable_seqscan = off");
    const { rows } = await db.query<{ "QUERY PLAN": string }>(
      "explain select mbid from public.artists where name ilike '%kendrick%'",
    );
    expect(rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain("artists_name_trgm_idx");
  });
});

describe("running a migration twice", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await localDatabase();
  });
  afterAll(() => db?.close());

  // The owner pastes each file into the SQL editor by hand, and sometimes
  // runs one again to be sure. From 0008 on, a second run must be harmless.
  const rerunnable = migrationFiles().filter((name) => name >= "0008");

  it.each(rerunnable)("%s", async (name) => {
    await expect(db.exec(migrationSql(name))).resolves.toBeDefined();
  });
});

describe("0023 push notifications", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`insert into auth.users (id) values ('${U(1)}'), ('${U(2)}');`);
  });
  afterAll(() => db?.close());

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0023_push_notifications.sql"));
  });

  it("keeps one row per phone, moving a phone to whoever registered it last", async () => {
    await db.exec(`
      insert into public.push_devices (token, user_id, platform) values ('ExponentPushToken[a]', '${U(1)}', 'ios');
      insert into public.push_devices (token, user_id, platform) values ('ExponentPushToken[a]', '${U(2)}', 'ios')
        on conflict (token) do update set user_id = excluded.user_id;
    `);
    const { rows } = await db.query<{ user_id: string }>(
      "select user_id from public.push_devices where token = 'ExponentPushToken[a]'",
    );
    expect(rows).toEqual([{ user_id: U(2) }]);
  });

  it("refuses an unknown platform and an unknown kind of push", async () => {
    await refuses(
      db,
      `insert into public.push_devices (token, user_id, platform) values ('ExponentPushToken[b]', '${U(1)}', 'windows')`,
    );
    await refuses(
      db,
      `insert into public.push_log (user_id, kind, key) values ('${U(1)}', 'poke', 'x')`,
    );
  });

  it("logs each push once", async () => {
    await db.exec(
      `insert into public.push_log (user_id, kind, key) values ('${U(1)}', 'versus', '2026-10-29')`,
    );
    await refuses(
      db,
      `insert into public.push_log (user_id, kind, key) values ('${U(1)}', 'versus', '2026-10-29')`,
    );
  });

  it("starts everyone with every switch on", async () => {
    await db.exec(`insert into public.personal_settings (user_id) values ('${U(1)}')`);
    const { rows } = await db.query(
      `select notify_follows, notify_loves, notify_replies, notify_versus, notify_drop, notify_streak
       from public.personal_settings where user_id = '${U(1)}'`,
    );
    expect(rows[0]).toEqual({
      notify_follows: true,
      notify_loves: true,
      notify_replies: true,
      notify_versus: true,
      notify_drop: true,
      notify_streak: true,
    });
  });

  it("keeps all three tables from the public roles", async () => {
    for (const table of ["personal_settings", "push_devices", "push_log"]) {
      await refuses(db, `set role authenticated; select * from public.${table}; reset role;`);
      await db.exec("reset role");
    }
  });

  it("forgets a deleted account's phones, switches and log", async () => {
    await db.exec(
      `insert into public.push_devices (token, user_id, platform) values ('ExponentPushToken[c]', '${U(1)}', 'ios')`,
    );
    await db.exec(`delete from auth.users where id = '${U(1)}'`);
    const { rows } = await db.query(
      `select (select count(*) from public.personal_settings where user_id = '${U(1)}')::int as s,
              (select count(*) from public.push_devices where user_id = '${U(1)}')::int as d,
              (select count(*) from public.push_log where user_id = '${U(1)}')::int as l`,
    );
    expect(rows[0]).toEqual({ s: 0, d: 0, l: 0 });
  });
});

describe("0024 replies", () => {
  let db: PGlite;
  const NAS = "44444444-4444-4444-8444-444444444444";
  const JAY = "55555555-5555-4555-8555-555555555555";
  // U(1) wrote a review, an artist review and a take; U(2) replies; U(3) has
  // blocked U(2) and wrote a review too; U(4) gave a score with no words.
  let review = 0;
  let artistReview = 0;
  let take = 0;
  let blockerReview = 0;
  let bareScore = 0;
  let bareArtistRating = 0;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
      insert into public.profiles (id, username) values
        ('${U(1)}', 'author'), ('${U(2)}', 'replier'), ('${U(3)}', 'blocker'), ('${U(4)}', 'bystander');
      insert into public.artists (mbid, name) values ('${NAS}', 'Nas'), ('${JAY}', 'Jay-Z');
      insert into public.releases (mbid, title, artist_mbid) values ('${ALBUM}', 'Illmatic', '${NAS}');
      insert into public.versus_matchups (day, left_artist_mbid, right_artist_mbid)
        values ('2026-10-29', '${NAS}', '${JAY}');
      insert into public.versus_votes (matchup_id, user_id, pick)
        select id, '${U(1)}', 'left' from public.versus_matchups;
      insert into public.versus_takes (matchup_id, user_id, body)
        select id, '${U(1)}', 'Nas, easily.' from public.versus_matchups;
      insert into public.ratings (user_id, release_mbid, score, review) values
        ('${U(1)}', '${ALBUM}', 10, 'Front to back.'),
        ('${U(3)}', '${ALBUM}', 8, 'Strong.');
      insert into public.ratings (user_id, release_mbid, score) values ('${U(4)}', '${ALBUM}', 7);
      insert into public.artist_ratings (user_id, artist_mbid, score, review)
        values ('${U(1)}', '${NAS}', 9, 'The best.');
      insert into public.artist_ratings (user_id, artist_mbid, score)
        values ('${U(4)}', '${NAS}', 6);
      insert into public.blocks (blocker_id, blocked_id) values ('${U(3)}', '${U(2)}');
    `);
    const idOf = async (sql: string) => (await db.query<{ id: number }>(sql)).rows[0]?.id ?? 0;
    review = await idOf(`select id::int as id from public.ratings where user_id = '${U(1)}'`);
    blockerReview = await idOf(
      `select id::int as id from public.ratings where user_id = '${U(3)}'`,
    );
    bareScore = await idOf(`select id::int as id from public.ratings where user_id = '${U(4)}'`);
    artistReview = await idOf(
      `select id::int as id from public.artist_ratings where user_id = '${U(1)}'`,
    );
    bareArtistRating = await idOf(
      `select id::int as id from public.artist_ratings where user_id = '${U(4)}'`,
    );
    take = await idOf("select id::int as id from public.versus_takes");
  });
  afterAll(() => db?.close());

  /** One statement as somebody signed in (null: signed out), under row-level security. */
  async function as<T>(user: string | null, sql: string): Promise<T[]> {
    await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ""}', false)`);
    await db.exec(`set role ${user ? "authenticated" : "anon"}`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  }

  /** One statement as the website's server, which writes replies with the service role. */
  async function asServer<T>(sql: string): Promise<T[]> {
    await db.exec("set role service_role");
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  }

  /** A reply by `user`, posted the only way there is: through the website. */
  const replyAs = (user: string, column: string, target: number, body = "Agreed.") =>
    asServer<{ id: number }>(
      `insert into public.replies (user_id, ${column}, body)
       values ('${user}', ${target}, '${body}') returning id::int as id`,
    );

  const count = async (where: string) =>
    (await db.query<{ n: number }>(`select count(*)::int as n from public.replies where ${where}`))
      .rows[0]?.n;

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0024_replies.sql"));
  });

  it("takes exactly one thing to reply to", async () => {
    await refuses(db, `insert into public.replies (user_id, body) values ('${U(2)}', 'Hm.')`);
    await refuses(
      db,
      `insert into public.replies (user_id, rating_id, versus_take_id, body)
       values ('${U(2)}', ${review}, ${take}, 'Hm.')`,
    );
  });

  it("holds a reply to 1 to 1,000 characters once trimmed", async () => {
    await refuses(
      db,
      `insert into public.replies (user_id, rating_id, body) values ('${U(2)}', ${review}, '   ')`,
    );
    await refuses(
      db,
      `insert into public.replies (user_id, rating_id, body)
       values ('${U(2)}', ${review}, repeat('x', 1001))`,
    );
    await db.exec(
      `insert into public.replies (user_id, rating_id, body)
       values ('${U(2)}', ${review}, repeat('x', 1000))`,
    );
    await db.exec("delete from public.replies");
  });

  it("lets the website reply for somebody signed in, and others read it", async () => {
    await replyAs(U(2), "rating_id", review);
    await replyAs(U(2), "artist_rating_id", artistReview);
    await replyAs(U(2), "versus_take_id", take);
    const seen = await as<{ body: string }>(
      U(4),
      `select body from public.replies where rating_id = ${review}`,
    );
    expect(seen).toEqual([{ body: "Agreed." }]);
  });

  it("keeps replies from signed-out visitors", async () => {
    await expect(as(null, "select * from public.replies")).rejects.toThrow();
  });

  it("takes replies only from the website, never straight from somebody signed in", async () => {
    // Not even as themselves: the website's rate limit, word filter, block
    // check and pick-first lock would all be skipped.
    for (const user of [U(2), U(4)]) {
      await expect(
        as(
          U(2),
          `insert into public.replies (user_id, rating_id, body) values ('${user}', ${review}, 'Hi.')`,
        ),
      ).rejects.toThrow();
    }
    await expect(
      as(
        null,
        `insert into public.replies (user_id, rating_id, body) values ('${U(2)}', ${review}, 'Hi.')`,
      ),
    ).rejects.toThrow();
    expect(await count("body = 'Hi.'")).toBe(0);
  });

  it("keeps the public roles from writing, emptying or hanging triggers on replies", async () => {
    const checks = ["anon", "authenticated"].flatMap((role) =>
      ["insert", "update", "truncate", "trigger", "references"].map(
        (what) => `has_table_privilege('${role}', 'public.replies', '${what}') as ${role}_${what}`,
      ),
    );
    const { rows } = await db.query<Record<string, boolean>>(`select ${checks.join(", ")}`);
    expect(Object.values(rows[0] ?? {})).toEqual(Array(10).fill(false));
  });

  it("won't take a reply to a score with no words", async () => {
    await expect(replyAs(U(2), "rating_id", bareScore)).rejects.toThrow();
  });

  it("hides replies by, or to, people hidden from the reader", async () => {
    // U(3) blocked U(2): U(3) doesn't see U(2)'s reply on U(1)'s review.
    expect(await as(U(3), `select id from public.replies where rating_id = ${review}`)).toEqual([]);
    // U(4)'s reply on U(3)'s review is hidden from U(2), whom U(3) blocked.
    await replyAs(U(4), "rating_id", blockerReview, "Fair.");
    expect(
      await as(U(2), `select id from public.replies where rating_id = ${blockerReview}`),
    ).toEqual([]);
    expect(
      await as(U(1), `select body from public.replies where rating_id = ${blockerReview}`),
    ).toEqual([{ body: "Fair." }]);
  });

  it("counts each review's replies, leaving out people hidden from the reader", async () => {
    const counts = (user: string | null, kind: string, ids: number[]) =>
      as<{ id: number; replies: number }>(
        user,
        `select id::int as id, replies::int as replies
         from public.reply_counts('${kind}', array[${ids.join(",")}]::bigint[]) order by id`,
      );
    const albums = [review, blockerReview, bareScore];
    expect(await counts(U(1), "album", albums)).toEqual([
      { id: review, replies: 1 },
      { id: blockerReview, replies: 1 },
    ]);
    // U(3) blocked U(2): U(2)'s reply on U(1)'s review isn't counted for U(3),
    expect(await counts(U(3), "album", albums)).toEqual([{ id: blockerReview, replies: 1 }]);
    // and U(3)'s review, with everything on it, isn't counted for U(2).
    expect(await counts(U(2), "album", albums)).toEqual([{ id: review, replies: 1 }]);
    expect(await counts(U(1), "artist", [artistReview])).toEqual([
      { id: artistReview, replies: 1 },
    ]);
    expect(await counts(U(1), "take", [take])).toEqual([{ id: take, replies: 1 }]);
    expect(await counts(U(1), "song", [review])).toEqual([]);
    // Signed out there are no replies to read, so nothing is counted.
    expect(await counts(null, "album", albums)).toEqual([]);
  });

  it("lets anybody ask for counts, which hold to replies' own rules", async () => {
    const { rows } = await db.query<{ anon: boolean; signed_in: boolean }>(
      `select has_function_privilege('anon', 'public.reply_counts(text,bigint[])', 'execute') as anon,
              has_function_privilege('authenticated', 'public.reply_counts(text,bigint[])', 'execute') as signed_in`,
    );
    expect(rows[0]).toEqual({ anon: true, signed_in: true });
  });

  it("lets you delete your own reply, and any on your own review, and nothing else", async () => {
    const [mine] = await replyAs(U(4), "rating_id", review, "Mine.");
    // U(4) can't delete U(2)'s reply: nothing happens.
    await as(
      U(4),
      `delete from public.replies where user_id = '${U(2)}' and rating_id = ${review}`,
    );
    expect(await count(`user_id = '${U(2)}' and rating_id = ${review}`)).toBe(1);
    // U(1) wrote the review, so U(1) can.
    await as(
      U(1),
      `delete from public.replies where user_id = '${U(2)}' and rating_id = ${review}`,
    );
    expect(await count(`user_id = '${U(2)}' and rating_id = ${review}`)).toBe(0);
    // U(4) deletes their own.
    await as(U(4), `delete from public.replies where id = ${mine?.id ?? 0}`);
    expect(await count(`id = ${mine?.id ?? 0}`)).toBe(0);
  });

  it("refuses a reply of only new lines or tabs", async () => {
    await refuses(
      db,
      `insert into public.replies (user_id, rating_id, body)
       values ('${U(2)}', ${review}, E'\n\t \r\n')`,
    );
  });

  it("refuses a reply to an artist rating with no words, or to a cleared review", async () => {
    await expect(replyAs(U(2), "artist_rating_id", bareArtistRating)).rejects.toThrow();
    await db.exec(`insert into public.ratings (user_id, release_mbid, score, review)
      values ('${U(2)}', '${ALBUM}', 5, 'Meh.')`);
    const cleared =
      (
        await db.query<{ id: number }>(
          `select id::int as id from public.ratings where user_id = '${U(2)}'`,
        )
      ).rows[0]?.id ?? 0;
    await db.exec(`update public.ratings set review = null where id = ${cleared}`);
    await expect(replyAs(U(4), "rating_id", cleared)).rejects.toThrow();
  });

  it("lets a take's author delete a reply on it", async () => {
    await db.exec(`delete from public.replies where versus_take_id = ${take}`);
    await replyAs(U(2), "versus_take_id", take, "Disagree.");
    await as(U(4), `delete from public.replies where versus_take_id = ${take}`);
    expect(await count(`versus_take_id = ${take}`)).toBe(1);
    await as(U(1), `delete from public.replies where versus_take_id = ${take}`);
    expect(await count(`versus_take_id = ${take}`)).toBe(0);
  });

  it("keeps reply_thread_owner for the server", async () => {
    const { rows } = await db.query<{ anon: boolean; signed_in: boolean; server: boolean }>(
      `select has_function_privilege('anon', 'public.reply_thread_owner(bigint,bigint,bigint)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.reply_thread_owner(bigint,bigint,bigint)', 'execute') as signed_in,
              has_function_privilege('service_role', 'public.reply_thread_owner(bigint,bigint,bigint)', 'execute') as server`,
    );
    expect(rows[0]).toEqual({ anon: false, signed_in: false, server: true });
  });

  it("records whose thread a reply is in, whatever the writer sends", async () => {
    const [reply] = await asServer<{ id: number }>(
      `insert into public.replies (user_id, artist_rating_id, thread_owner_id, body)
       values ('${U(4)}', ${artistReview}, '${U(4)}', 'Mine now?') returning id::int as id`,
    );
    const { rows } = await db.query<{ owner: string }>(
      `select thread_owner_id as owner from public.replies where id = ${reply?.id ?? 0}`,
    );
    expect(rows).toEqual([{ owner: U(1) }]);
    await db.exec(`delete from public.replies where id = ${reply?.id ?? 0}`);
  });

  it("can't be edited", async () => {
    await replyAs(U(2), "rating_id", review, "First.");
    await expect(
      as(U(2), `update public.replies set body = 'Changed.' where user_id = '${U(2)}'`),
    ).rejects.toThrow();
    expect(await count("body = 'Changed.'")).toBe(0);
  });

  it("goes with the review when its words are cleared", async () => {
    expect(await count(`rating_id = ${review}`)).toBeGreaterThan(0);
    await db.exec(`update public.ratings set review = null where id = ${review}`);
    expect(await count(`rating_id = ${review}`)).toBe(0);
    // A changed score leaves a written review's thread alone.
    await db.exec(`update public.artist_ratings set score = 8 where id = ${artistReview}`);
    expect(await count(`artist_rating_id = ${artistReview}`)).toBe(1);
  });

  it("goes with the take, and with the account that wrote it", async () => {
    await db.exec(`delete from public.versus_takes where id = ${take}`);
    expect(await count(`versus_take_id = ${take}`)).toBe(0);
    await db.exec(`delete from auth.users where id = '${U(2)}'`);
    expect(await count(`user_id = '${U(2)}'`)).toBe(0);
  });

  it("can be reported, one thing at a time", async () => {
    const [reply] = await replyAs(U(4), "artist_rating_id", artistReview, "Report me.");
    await db.exec(
      `insert into public.reports (reporter_id, reported_reply_id, reason)
       values ('${U(1)}', ${reply?.id ?? 0}, 'Spam or advertising')`,
    );
    await refuses(
      db,
      `insert into public.reports (reporter_id, reported_reply_id, reported_profile_id, reason)
       values ('${U(1)}', ${reply?.id ?? 0}, '${U(4)}', 'Spam or advertising')`,
    );
  });

  it("has room in a report for the reply's words beside the reporter's own", async () => {
    const [reply] = await replyAs(U(4), "artist_rating_id", artistReview, "Report me too.");
    // The reporter's 500 characters, a blank line, "Reply: " and the reply's 1,000.
    await db.exec(
      `insert into public.reports (reporter_id, reported_reply_id, reason, detail)
       values ('${U(1)}', ${reply?.id ?? 0}, 'Spam or advertising',
               repeat('d', 500) || E'\\n\\nReply: ' || repeat('r', 1000))`,
    );
    await refuses(
      db,
      `insert into public.reports (reporter_id, reported_profile_id, reason, detail)
       values ('${U(1)}', '${U(4)}', 'Spam or advertising', repeat('x', 1601))`,
    );
  });

  /** A report of a reply, filed as the website files it: as the reporter, with the reply's words. */
  async function reportReply(reporter: string, reply: number, words: string) {
    await as(
      reporter,
      `insert into public.reports (reporter_id, reported_reply_id, reason, detail)
       values ('${reporter}', ${reply}, 'Harassment or bullying', 'Rude.' || E'\\n\\nReply: ' || '${words}')`,
    );
  }

  const reportsOf = (words: string) =>
    db.query<{ reply: number | null; detail: string; status: string }>(
      `select reported_reply_id::int as reply, detail, status from public.reports
       where detail like '%Reply: ${words}'`,
    );

  it("keeps a reply's report, with the words it copied, when its writer deletes the reply", async () => {
    const [reply] = await replyAs(U(4), "artist_rating_id", artistReview, "Gone soon.");
    await reportReply(U(1), reply?.id ?? 0, "Gone soon.");
    await as(U(4), `delete from public.replies where id = ${reply?.id ?? 0}`);
    expect(await count(`id = ${reply?.id ?? 0}`)).toBe(0);
    expect((await reportsOf("Gone soon.")).rows).toEqual([
      { reply: null, detail: "Rude.\n\nReply: Gone soon.", status: "open" },
    ]);
  });

  it("keeps it when the review's writer deletes the reply, or clears the review", async () => {
    const [onMine] = await replyAs(U(4), "artist_rating_id", artistReview, "Owner deletes.");
    await reportReply(U(3), onMine?.id ?? 0, "Owner deletes.");
    await as(U(1), `delete from public.replies where id = ${onMine?.id ?? 0}`);
    expect((await reportsOf("Owner deletes.")).rows).toEqual([
      expect.objectContaining({ reply: null, status: "open" }),
    ]);

    const [cleared] = await replyAs(U(4), "rating_id", blockerReview, "Review cleared.");
    await reportReply(U(1), cleared?.id ?? 0, "Review cleared.");
    await db.exec(`update public.ratings set review = null where id = ${blockerReview}`);
    expect(await count(`id = ${cleared?.id ?? 0}`)).toBe(0);
    expect((await reportsOf("Review cleared.")).rows).toEqual([
      expect.objectContaining({ reply: null, status: "open" }),
    ]);
  });

  it("refuses a report about nothing from somebody signed in, as about two things", async () => {
    await expect(
      as(
        U(1),
        `insert into public.reports (reporter_id, reason) values ('${U(1)}', 'Spam or advertising')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(
        U(1),
        `insert into public.reports (reporter_id, reported_profile_id, reported_artist_rating_id, reason)
         values ('${U(1)}', '${U(4)}', ${artistReview}, 'Spam or advertising')`,
      ),
    ).rejects.toThrow();
  });

  it("still takes a report of a profile, a review or a list from somebody signed in", async () => {
    await db.exec(`insert into public.lists (user_id, title) values ('${U(1)}', 'Best of')`);
    const list =
      (await db.query<{ id: number }>("select id::int as id from public.lists")).rows[0]?.id ?? 0;
    for (const [column, target] of [
      ["reported_profile_id", `'${U(1)}'`],
      ["reported_artist_rating_id", artistReview],
      ["reported_list_id", list],
    ]) {
      await as(
        U(4),
        `insert into public.reports (reporter_id, ${column}, reason)
         values ('${U(4)}', ${target}, 'Spam or advertising')`,
      );
    }
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from public.reports where reporter_id = '${U(4)}'`,
        )
      ).rows[0]?.n,
    ).toBe(3);
  });
});

describe("0024 over existing reports", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase({ before: "0024" });
    // Reports of every kind there was before replies.
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}');
      insert into public.profiles (id, username) values ('${U(1)}', 'one'), ('${U(2)}', 'two');
      insert into public.artists (mbid, name) values ('${ALBUM}', 'Nas');
      insert into public.releases (mbid, title, artist_mbid) values ('${ALBUM}', 'Illmatic', '${ALBUM}');
      insert into public.ratings (user_id, release_mbid, score, review)
        values ('${U(2)}', '${ALBUM}', 9, 'Yes.');
      insert into public.artist_ratings (user_id, artist_mbid, score, review)
        values ('${U(2)}', '${ALBUM}', 9, 'Yes.');
      insert into public.lists (user_id, title) values ('${U(2)}', 'Mine');
      insert into public.reports (reporter_id, reported_profile_id, reason)
        values ('${U(1)}', '${U(2)}', 'Spam or advertising');
      insert into public.reports (reporter_id, reported_rating_id, reason)
        select '${U(1)}', id, 'Spam or advertising' from public.ratings;
      insert into public.reports (reporter_id, reported_artist_rating_id, reason)
        select '${U(1)}', id, 'Spam or advertising' from public.artist_ratings;
      insert into public.reports (reporter_id, reported_list_id, reason)
        select '${U(1)}', id, 'Spam or advertising' from public.lists;
    `);
    for (const name of migrationFiles().filter((f) => f >= "0024")) {
      await db.exec(migrationSql(name));
    }
  });
  afterAll(() => db?.close());

  it("keeps every report, under a target rule they all pass", async () => {
    const { rows } = await db.query<{ conname: string; convalidated: boolean }>(
      `select conname, convalidated from pg_constraint
       where conrelid = 'public.reports'::regclass and pg_get_constraintdef(oid) like '%num_nonnulls%'`,
    );
    expect(rows).toEqual([{ conname: "reports_at_most_one_target", convalidated: true }]);
    expect(
      (await db.query<{ n: number }>("select count(*)::int as n from public.reports")).rows[0]?.n,
    ).toBe(4);
  });

  it("still refuses a report about two things", async () => {
    await refuses(
      db,
      `insert into public.reports (reporter_id, reported_profile_id, reported_rating_id, reason)
       select '${U(2)}', '${U(1)}', id, 'Spam or advertising' from public.ratings`,
    );
  });
});

describe("0024 reply mentions", () => {
  let db: PGlite;
  // U(2) replies on U(1)'s review naming U(3) and U(4); U(4) has blocked U(2).
  let reply = 0;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
      insert into public.profiles (id, username) values
        ('${U(1)}', 'author'), ('${U(2)}', 'replier'), ('${U(3)}', 'named'), ('${U(4)}', 'blocker');
      insert into public.artists (mbid, name) values ('44444444-4444-4444-8444-444444444444', 'Nas');
      insert into public.releases (mbid, title, artist_mbid)
        values ('${ALBUM}', 'Illmatic', '44444444-4444-4444-8444-444444444444');
      insert into public.ratings (user_id, release_mbid, score, review)
        values ('${U(1)}', '${ALBUM}', 10, 'Front to back.');
      insert into public.replies (user_id, rating_id, body)
        select '${U(2)}'::uuid, id, '@named @blocker' from public.ratings;
      insert into public.reply_mentions (reply_id, user_id)
        select id, '${U(3)}'::uuid from public.replies
        union all select id, '${U(4)}'::uuid from public.replies;
      insert into public.blocks (blocker_id, blocked_id) values ('${U(4)}', '${U(2)}');
    `);
    reply =
      (await db.query<{ id: number }>("select id::int as id from public.replies")).rows[0]?.id ?? 0;
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

  const count = async () =>
    (await db.query<{ n: number }>("select count(*)::int as n from public.reply_mentions")).rows[0]
      ?.n;

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0024_replies.sql"));
  });

  it("lets each person read only where they're named", async () => {
    expect(await as(U(3), "select user_id from public.reply_mentions")).toEqual([
      { user_id: U(3) },
    ]);
    expect(await as(U(1), "select user_id from public.reply_mentions")).toEqual([]);
    await expect(as(null, "select * from public.reply_mentions")).rejects.toThrow();
  });

  it("keeps a reply hidden from somebody blocked either way, though they were named", async () => {
    const seen = `select r.id from public.reply_mentions m
      join public.replies r on r.id = m.reply_id`;
    expect(await as(U(3), seen)).toEqual([{ id: reply }]);
    expect(await as(U(4), seen)).toEqual([]);
  });

  it("can't be written by the public roles", async () => {
    await expect(
      as(
        U(1),
        `insert into public.reply_mentions (reply_id, user_id) values (${reply}, '${U(1)}')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(U(3), `delete from public.reply_mentions where user_id = '${U(3)}'`),
    ).rejects.toThrow();
    await expect(
      as(U(3), `update public.reply_mentions set user_id = '${U(1)}'`),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        `insert into public.reply_mentions (reply_id, user_id) values (${reply}, '${U(1)}')`,
      ),
    ).rejects.toThrow();
    expect(await count()).toBe(2);
  });

  it("goes with the account named, and with the reply", async () => {
    await db.exec(`delete from auth.users where id = '${U(3)}'`);
    expect(await count()).toBe(1);
    await db.exec(`delete from public.replies where id = ${reply}`);
    expect(await count()).toBe(0);
  });
});

describe("0025 listening diary", () => {
  let db: PGlite;
  const NAS = "44444444-4444-4444-8444-444444444444";
  const OTHER = "66666666-6666-4666-8666-666666666666";
  // U(1) keeps a diary; U(2) reads it; U(3) has blocked U(1); U(4) keeps a private one.

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
      insert into public.profiles (id, username) values
        ('${U(1)}', 'keeper'), ('${U(2)}', 'reader'), ('${U(3)}', 'blocker'), ('${U(4)}', 'quiet');
      update public.profiles set diary_public = false where id = '${U(4)}';
      insert into public.artists (mbid, name) values ('${NAS}', 'Nas');
      insert into public.releases (mbid, title, artist_mbid) values
        ('${ALBUM}', 'Illmatic', '${NAS}'), ('${OTHER}', 'It Was Written', '${NAS}');
      insert into public.blocks (blocker_id, blocked_id) values ('${U(3)}', '${U(1)}');
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

  const merge = (user: string, source: string, entries: object[]) =>
    db.query<{ added: number; merged: number }>(
      "select added, merged from public.diary_merge($1, $2, $3::jsonb)",
      [user, source, JSON.stringify(entries)],
    );

  const day = (overrides: object = {}) => ({
    day: "2026-10-12",
    key: "nas|illmatic",
    artist: "Nas",
    album: "Illmatic",
    songHint: "N.Y. State of Mind",
    songs: 5,
    minutes: 22,
    plays: 6,
    ...overrides,
  });

  const entries = async (user: string) =>
    (
      await db.query<{
        day: string;
        album_key: string;
        sources: string[];
        songs: number;
        minutes: number;
        plays: number;
        release_mbid: string | null;
        fixed: boolean;
      }>(
        `select day::text as day, album_key, sources, songs, minutes, plays, release_mbid, fixed
         from public.diary_entries where user_id = $1 order by day, album_key`,
        [user],
      )
    ).rows;

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0025_listening_diary.sql"));
  });

  it("adds an album-day, and merges the same one from another source", async () => {
    expect((await merge(U(1), "spotify", [day()])).rows[0]).toEqual({ added: 1, merged: 0 });
    expect(
      (await merge(U(1), "lastfm", [day({ songs: 7, minutes: 10, plays: 3 })])).rows[0],
    ).toEqual({ added: 0, merged: 1 });
    expect(await entries(U(1))).toEqual([
      expect.objectContaining({
        day: "2026-10-12",
        sources: ["lastfm", "spotify"],
        songs: 7,
        minutes: 22,
        plays: 6,
      }),
    ]);
  });

  it("keeps one entry for the same day and key sent twice in one batch", async () => {
    await merge(U(1), "spotify", [
      day({ day: "2026-10-13", songs: 4 }),
      day({ day: "2026-10-13", songs: 9 }),
    ]);
    const rows = (await entries(U(1))).filter((r) => r.day === "2026-10-13");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.songs).toBe(9);
  });

  it("files every new name in the shared table, and uses a match already made", async () => {
    await db.exec(
      `update public.album_matches set release_mbid = '${ALBUM}', matched_by = 'musicbrainz'
       where album_key = 'nas|illmatic'`,
    );
    await merge(U(1), "spotify", [day({ day: "2026-10-14" })]);
    const row = (await entries(U(1))).find((r) => r.day === "2026-10-14");
    expect(row?.release_mbid).toBe(ALBUM);
    const names = await db.query("select album_key from public.album_matches");
    expect(names.rows).toEqual([{ album_key: "nas|illmatic" }]);
  });

  it("logs by hand with the album chosen, kept out of the shared table", async () => {
    await merge(U(1), "hand", [
      day({
        day: "2026-10-15",
        key: "nas|it was written",
        album: "It Was Written",
        songs: 0,
        minutes: 0,
        plays: 0,
        mbid: OTHER,
      }),
    ]);
    const row = (await entries(U(1))).find((r) => r.day === "2026-10-15");
    expect(row).toEqual(
      expect.objectContaining({ release_mbid: OTHER, fixed: true, sources: ["hand"] }),
    );
    const names = await db.query(
      "select 1 from public.album_matches where album_key = 'nas|it was written'",
    );
    expect(names.rows).toEqual([]);
  });

  it("can't be called, or written to, by the public roles", async () => {
    await expect(
      as(U(1), `select * from public.diary_merge('${U(1)}', 'hand', '[]'::jsonb)`),
    ).rejects.toThrow();
    await expect(
      as(
        U(1),
        `insert into public.diary_entries (user_id, day, album_key, artist_name, album_name, sources)
         values ('${U(1)}', '2026-01-01', 'a|b', 'A', 'B', array['hand'])`,
      ),
    ).rejects.toThrow();
    await expect(as(U(1), "delete from public.diary_entries")).rejects.toThrow();
    await expect(as(U(1), "select * from public.album_matches")).rejects.toThrow();
    await expect(as(U(1), "select * from public.diary_sources")).rejects.toThrow();
  });

  it("shows a public diary to anyone, signed out too, but not across a block", async () => {
    expect(
      (await as(U(2), `select id from public.diary_entries where user_id = '${U(1)}'`)).length,
    ).toBeGreaterThan(0);
    expect(
      (await as(null, `select id from public.diary_entries where user_id = '${U(1)}'`)).length,
    ).toBeGreaterThan(0);
    expect(await as(U(3), `select id from public.diary_entries where user_id = '${U(1)}'`)).toEqual(
      [],
    );
  });

  it("shows a private diary to its owner only", async () => {
    await merge(U(4), "spotify", [day()]);
    expect(await as(U(2), `select id from public.diary_entries where user_id = '${U(4)}'`)).toEqual(
      [],
    );
    expect(await as(null, `select id from public.diary_entries where user_id = '${U(4)}'`)).toEqual(
      [],
    );
    expect(
      (await as(U(4), `select id from public.diary_entries where user_id = '${U(4)}'`)).length,
    ).toBe(1);
  });

  it("totals each month and counts what's waiting for a score", async () => {
    const months = await as<{ month: string; albums: number; minutes: number }>(
      null,
      `select * from public.diary_months('${U(1)}', '2026-10-01', '2026-10-31')`,
    );
    expect(months).toEqual([{ month: "2026-10", albums: 2, minutes: 66 }]);
    // Illmatic is matched and unrated; It Was Written was logged by hand.
    expect(await as(U(1), "select public.diary_waiting() as n")).toEqual([{ n: 2 }]);
    await db.exec(
      `insert into public.ratings (user_id, release_mbid, score) values ('${U(1)}', '${ALBUM}', 9)`,
    );
    expect(await as(U(1), "select public.diary_waiting() as n")).toEqual([{ n: 1 }]);
    expect(await as(U(1), "select release_mbid from public.diary_to_rate(10)")).toEqual([
      { release_mbid: OTHER },
    ]);
  });

  it("removes a source, keeping entries another source sent too", async () => {
    const removed = await db.query<{ n: number }>(
      `select public.diary_remove_source('${U(1)}', 'spotify') as n`,
    );
    expect(removed.rows[0]?.n).toBeGreaterThan(0);
    const left = await entries(U(1));
    expect(left.find((r) => r.day === "2026-10-12")?.sources).toEqual(["lastfm"]);
    expect(left.find((r) => r.day === "2026-10-13")).toBeUndefined();
  });

  it("holds the rules on each column", async () => {
    await refuses(
      db,
      `insert into public.diary_entries (user_id, day, album_key, artist_name, album_name, sources)
       values ('${U(1)}', '1899-12-31', 'a|bc', 'A', 'B', array['hand'])`,
    );
    await refuses(
      db,
      `insert into public.diary_entries (user_id, day, album_key, artist_name, album_name, sources)
       values ('${U(1)}', '2026-01-01', 'a|bc', 'A', 'B', array['tidal'])`,
    );
    await refuses(
      db,
      `insert into public.diary_entries (user_id, day, album_key, artist_name, album_name, sources)
       values ('${U(1)}', '2026-01-01', 'a|bc', 'A', 'B', array[]::text[])`,
    );
  });

  it("lets the push log take diary pushes, and has the switch", async () => {
    await db.exec(
      `insert into public.push_log (user_id, kind, key) values ('${U(1)}', 'diary', 'diary-import-lastfm-2026-10-30')`,
    );
    await db.exec(
      `insert into public.personal_settings (user_id, notify_diary) values ('${U(2)}', false)`,
    );
  });

  it("goes with the account, and lets go of an album that leaves", async () => {
    await db.exec(`delete from public.releases where mbid = '${OTHER}'`);
    expect((await entries(U(1))).find((r) => r.day === "2026-10-15")?.release_mbid).toBeNull();
    await db.exec(`delete from auth.users where id = '${U(1)}'`);
    expect(await entries(U(1))).toEqual([]);
  });
});
