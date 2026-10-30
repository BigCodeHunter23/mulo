import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrationSql } from "../scripts/local-db.mjs";

/**
 * Migration 0026, following artists and new releases, replayed on an
 * in-memory Postgres: it runs twice, and its rules hold.
 */

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const CLIPSE = "0e05ba8a-56a7-4ea6-9d11-8f4f2d10e2d1";
const NAS = "cfbc0924-0035-4d6c-8197-f024653af823";
const GOAT = "9b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3";
const CHROMAKOPIA = "6ca2762c-ffb5-4ea1-a8c6-2f25993fc99a";
const IGOR = "8ddd27bd-16c5-4205-9eff-f55a2951802a";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
/** A made-up artist id, one per number. */
const A = (n: number) => `md5('artist ${n}')::uuid`;

describe("0026 following artists", () => {
  let db: PGlite;
  // U(1) follows and rates; U(2) is somebody else; U(3) follows 2,000 artists.

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
      insert into public.profiles (id, username) values
        ('${U(1)}', 'fan'), ('${U(2)}', 'other'), ('${U(3)}', 'full');
      insert into public.artists (mbid, name) values
        ('${TYLER}', 'Tyler, the Creator'), ('${CLIPSE}', 'Clipse'), ('${NAS}', 'Nas'),
        ('${GOAT}', 'Outkast');
      insert into public.releases (mbid, title, artist_mbid) values
        ('${IGOR}', 'IGOR', '${TYLER}'), ('${ILLMATIC}', 'Illmatic', '${NAS}');
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

  const follows = async (user: string) =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from public.artist_follows where user_id = '${user}'`,
      )
    ).rows[0]?.n;

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0026_artist_follows.sql"));
  });

  it("lets people follow and unfollow artists for themselves only, and anyone see it", async () => {
    await as(
      U(1),
      `insert into public.artist_follows (user_id, artist_mbid) values ('${U(1)}', '${TYLER}')`,
    );
    await expect(
      as(
        U(1),
        `insert into public.artist_follows (user_id, artist_mbid) values ('${U(2)}', '${TYLER}')`,
      ),
    ).rejects.toThrow();
    // Somebody else's delete finds nothing to delete.
    await as(U(2), `delete from public.artist_follows where user_id = '${U(1)}'`);
    expect(
      await as(null, `select user_id from public.artist_follows where artist_mbid = '${TYLER}'`),
    ).toEqual([{ user_id: U(1) }]);
    await expect(as(U(1), "update public.artist_follows set created_at = now()")).rejects.toThrow();
  });

  it("keeps each person to 2,000 artists, a statement of several included", async () => {
    await db.exec(`
      insert into public.artists (mbid, name)
      select md5('artist ' || n)::uuid, 'Artist ' || n from generate_series(1, 2001) n;
      insert into public.artist_follows (user_id, artist_mbid)
      select '${U(3)}', md5('artist ' || n)::uuid from generate_series(1, 1998) n;
    `);
    // Three at once would make 2,001: none of them go in.
    await expect(
      as(
        U(3),
        `insert into public.artist_follows (user_id, artist_mbid)
         select '${U(3)}', md5('artist ' || n)::uuid from generate_series(1999, 2001) n`,
      ),
    ).rejects.toThrow(/artist follows full/);
    expect(await follows(U(3))).toBe(1998);
    await as(
      U(3),
      `insert into public.artist_follows (user_id, artist_mbid)
       select '${U(3)}', md5('artist ' || n)::uuid from generate_series(1999, 2000) n`,
    );
    expect(await follows(U(3))).toBe(2000);
    await expect(
      as(
        U(3),
        `insert into public.artist_follows (user_id, artist_mbid) values ('${U(3)}', ${A(2001)})`,
      ),
    ).rejects.toThrow(/artist follows full/);
  });

  it("lets somebody at 2,000 add an artist they follow already, which changes nothing", async () => {
    await as(
      U(3),
      `insert into public.artist_follows (user_id, artist_mbid) values ('${U(3)}', ${A(1)})
       on conflict do nothing`,
    );
    // Plainly, it's the follow that's already there, not the limit.
    await expect(
      as(
        U(3),
        `insert into public.artist_follows (user_id, artist_mbid) values ('${U(3)}', ${A(1)})`,
      ),
    ).rejects.toThrow(/duplicate key/);
    expect(await follows(U(3))).toBe(2000);
  });

  it("goes with the account", async () => {
    await db.exec(`delete from auth.users where id = '${U(3)}'`);
    expect(await follows(U(3))).toBe(0);
  });

  it("shows new releases to anyone and lets only the service role write them", async () => {
    await db.exec(`
      insert into public.new_releases
        (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date, confirmed_at)
      values ('${CHROMAKOPIA}', '${TYLER}', array['${TYLER}'::uuid], 'CHROMAKOPIA', 'album',
        '2026-10-30', '2026-10-30', now());
    `);
    expect(await as(null, "select title from public.new_releases")).toEqual([
      { title: "CHROMAKOPIA" },
    ]);
    await expect(
      as(
        U(1),
        `insert into public.new_releases (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date)
         values (${A(9)}, '${TYLER}', array['${TYLER}'::uuid], 'X', 'album', '2026-10-30', '2026-10-30')`,
      ),
    ).rejects.toThrow();
    await expect(as(U(1), "delete from public.new_releases")).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.new_releases (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date)
         values (${A(9)}, '${TYLER}', array['${TYLER}'::uuid], 'Single', 'single', '2026-10-30', '2026-10-30')`,
      ),
    ).rejects.toThrow();
    // The artist it shows as is always one of those credited.
    await expect(
      db.exec(
        `insert into public.new_releases (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date)
         values (${A(9)}, '${TYLER}', array['${CLIPSE}'::uuid], 'X', 'album', '2026-10-30', '2026-10-30')`,
      ),
    ).rejects.toThrow();
  });

  const claim = async (day: string) =>
    (await db.query<{ ok: boolean }>(`select public.claim_release_read('${day}') as ok`)).rows[0]
      ?.ok;
  /** A run that ended without reading: its claim let go, as the clock does. */
  const letGo = (day: string) =>
    db.exec(`update public.artist_release_reads set claimed_at = null where day = '${day}'`);

  it("gives the day's read to one run at a time, for five minutes at most", async () => {
    expect(await claim("2026-10-29")).toBe(true);
    // A second run while the first is reading.
    expect(await claim("2026-10-29")).toBe(false);
    // A run that died without letting go holds it five minutes.
    await db.exec(
      `update public.artist_release_reads set claimed_at = now() - interval '4 minutes'
       where day = '2026-10-29'`,
    );
    expect(await claim("2026-10-29")).toBe(false);
    await db.exec(
      `update public.artist_release_reads set claimed_at = now() - interval '6 minutes'
       where day = '2026-10-29'`,
    );
    expect(await claim("2026-10-29")).toBe(true);
    const row = await db.query<{ tries: number }>(
      "select tries from public.artist_release_reads where day = '2026-10-29'",
    );
    expect(row.rows).toEqual([{ tries: 2 }]);
  });

  it("claims the day's read up to four times, and never once it's done", async () => {
    const tries: (boolean | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      tries.push(await claim("2026-10-30"));
      await letGo("2026-10-30");
    }
    expect(tries).toEqual([true, true, true, true, false]);
    expect(await claim("2026-10-31")).toBe(true);
    await db.exec(
      "update public.artist_release_reads set read_at = now(), claimed_at = null where day = '2026-10-31'",
    );
    expect(await claim("2026-10-31")).toBe(false);
  });

  it("keeps the clock's functions and table from the public roles", async () => {
    await expect(as(U(1), "select public.claim_release_read('2026-11-01')")).rejects.toThrow();
    await expect(
      as(U(1), `select * from public.followed_among(array['${TYLER}'::uuid])`),
    ).rejects.toThrow();
    await expect(as(U(1), "select * from public.artist_release_reads")).rejects.toThrow();
    expect(
      (
        await db.query(
          `select * from public.followed_among(array['${TYLER}'::uuid, '${CLIPSE}'::uuid])`,
        )
      ).rows,
    ).toEqual([{ artist_mbid: TYLER }]);
  });

  it("lists confirmed releases by the artists somebody follows, with when they followed", async () => {
    await db.exec(`
      insert into public.new_releases
        (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date)
      values (${A(10)}, '${TYLER}', array['${TYLER}'::uuid], 'Waiting', 'ep', '2026-10-30', '2026-10-30');
    `);
    const rows = await as<{ title: string; release_date: string; artist_name: string }>(
      U(2),
      `select title, release_date::text, artist_name
       from public.followed_releases('${U(1)}', '2026-10-01', '2026-11-30')`,
    );
    expect(rows).toEqual([
      { title: "CHROMAKOPIA", release_date: "2026-10-30", artist_name: "Tyler, the Creator" },
    ]);
    expect(
      await as(
        null,
        `select title from public.followed_releases('${U(1)}', '2026-11-01', '2026-11-30')`,
      ),
    ).toEqual([]);
  });

  it("lists a release for the followers of each credited artist, followed before or after", async () => {
    // Credited to Nas and Clipse, shown as Nas's. U(1) follows neither; U(2)
    // follows Nas; then, after it was found, U(1) follows Clipse.
    await db.exec(`
      insert into public.new_releases
        (release_group_mbid, artist_mbid, artist_mbids, title, kind, release_date, listed_date, confirmed_at)
      values (${A(11)}, '${NAS}', array['${NAS}'::uuid, '${CLIPSE}'::uuid], 'Together', 'album',
        '2026-10-29', '2026-10-29', now());
      insert into public.artist_follows (user_id, artist_mbid) values ('${U(2)}', '${NAS}');
    `);
    const together = (user: string) =>
      as<{ title: string; artist_name: string }>(
        null,
        `select title, artist_name from public.followed_releases('${user}', '2026-10-29', '2026-10-29')`,
      );
    expect(await together(U(2))).toEqual([{ title: "Together", artist_name: "Nas" }]);
    expect(await together(U(1))).toEqual([]);
    await db.exec(
      `insert into public.artist_follows (user_id, artist_mbid, created_at)
       values ('${U(1)}', '${CLIPSE}', now() + interval '1 day')`,
    );
    expect(await together(U(1))).toEqual([{ title: "Together", artist_name: "Nas" }]);
    // Following two of its artists still lists it once, from the first follow.
    await db.exec(
      `insert into public.artist_follows (user_id, artist_mbid) values ('${U(2)}', '${CLIPSE}')`,
    );
    const once = await db.query<{ followed_at: Date }>(
      `select followed_at from public.followed_releases('${U(2)}', '2026-10-29', '2026-10-29')`,
    );
    expect(once.rows).toHaveLength(1);
    await db.exec(
      `delete from public.artist_follows where artist_mbid = '${CLIPSE}';
       delete from public.artist_follows where user_id = '${U(2)}';
       delete from public.new_releases where release_group_mbid = ${A(11)};`,
    );
  });

  it("suggests the artists somebody rates highest, leaving out those they follow", async () => {
    await db.exec(`
      insert into public.artist_ratings (user_id, artist_mbid, score) values
        ('${U(1)}', '${CLIPSE}', 9), ('${U(1)}', '${GOAT}', 5);
      insert into public.ratings (user_id, release_mbid, score) values
        ('${U(1)}', '${ILLMATIC}', 10), ('${U(1)}', '${IGOR}', 10);
      insert into public.top_artists (user_id, position, artist_mbid) values ('${U(1)}', 1, '${GOAT}');
      insert into public.diary_entries (user_id, day, album_key, artist_name, album_name, release_mbid, sources)
      select '${U(1)}', date '2026-10-01' + n, 'nas|illmatic', 'Nas', 'Illmatic', '${ILLMATIC}', array['hand']
      from generate_series(1, 4) n;
    `);
    // Outkast: GOAT no. 1 (30; a 5 doesn't count). Clipse: 9 × 3 = 27.
    // Nas: Illmatic's 10 and four diary days, 14. Tyler is followed already.
    expect(await as(U(1), "select name from public.artist_suggestions(12)")).toEqual([
      { name: "Outkast" },
      { name: "Clipse" },
      { name: "Nas" },
    ]);
    expect(await as(U(1), "select name from public.artist_suggestions(1)")).toEqual([
      { name: "Outkast" },
    ]);
    expect(await as(U(2), "select name from public.artist_suggestions(12)")).toEqual([]);
    await expect(as(null, "select * from public.artist_suggestions(12)")).rejects.toThrow();
  });

  it("tells albums from EPs, notes when an artist's EPs were read, and has the switch and push kind", async () => {
    await db.exec(`update public.releases set kind = 'ep' where mbid = '${IGOR}'`);
    await expect(
      db.exec(`update public.releases set kind = 'single' where mbid = '${IGOR}'`),
    ).rejects.toThrow();
    await db.exec(`update public.artists set eps_cached_at = now() where mbid = '${TYLER}'`);
    await db.exec(
      `insert into public.push_log (user_id, kind, key) values ('${U(1)}', 'release', '2026-10-30')`,
    );
    await db.exec(`insert into public.personal_settings (user_id) values ('${U(2)}')`);
    const row = await db.query<{ notify_releases: boolean }>(
      `select notify_releases from public.personal_settings where user_id = '${U(2)}'`,
    );
    expect(row.rows).toEqual([{ notify_releases: true }]);
  });
});
