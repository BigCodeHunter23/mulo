import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrationSql } from "../scripts/local-db.mjs";

/**
 * Migration 0028, the rules the website keeps held by the database too, replayed
 * on an in-memory Postgres. The public key lets anybody read and write with their
 * own session, past the website, so what matters is what the tables themselves
 * allow.
 */

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const PICKER = "00000000-0000-4000-8000-000000000003";
const NAS = "cfbc0924-0035-4d6c-8197-f024653af823";
const JAY = "f82bcf78-5b69-4622-a5ef-73800768d9ac";
const ILLMATIC = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const STILLMATIC = "8ddd27bd-16c5-4205-9eff-f55a2951802a";
const SONG = "11111111-1111-4111-8111-111111111111";
const SONG_2 = "22222222-2222-4222-8222-222222222222";

const SYDNEY_TODAY = "(now() at time zone 'Australia/Sydney')::date";
const TODAY = `(select id from public.versus_matchups where day = ${SYDNEY_TODAY})`;
const FINISHED = `(select id from public.versus_matchups where day = ${SYDNEY_TODAY} - 1)`;

describe("0028 what the website keeps back, the database keeps back", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await localDatabase();
    await db.exec(`
      insert into auth.users (id) values ('${ME}'), ('${OTHER}'), ('${PICKER}');
      insert into public.profiles (id, username) values
        ('${ME}', 'fan'), ('${OTHER}', 'other'), ('${PICKER}', 'picker');
      insert into public.artists (mbid, name) values ('${NAS}', 'Nas'), ('${JAY}', 'Jay-Z');
      insert into public.releases (mbid, title, artist_mbid) values
        ('${ILLMATIC}', 'Illmatic', '${NAS}'), ('${STILLMATIC}', 'Stillmatic', '${NAS}');
      insert into public.songs (mbid, title) values
        ('${SONG}', 'N.Y. State of Mind'), ('${SONG_2}', 'Halftime');
      insert into public.ratings (user_id, release_mbid, score) values ('${ME}', '${ILLMATIC}', 9);
      insert into public.artist_ratings (user_id, artist_mbid, score) values ('${ME}', '${NAS}', 9);
      insert into public.versus_matchups (day, left_artist_mbid, right_artist_mbid) values
        (${SYDNEY_TODAY}, '${NAS}', '${JAY}'),
        (${SYDNEY_TODAY} - 1, '${JAY}', '${NAS}');
      insert into public.versus_votes (matchup_id, user_id, pick) values
        (${TODAY}, '${OTHER}', 'left'),
        (${TODAY}, '${PICKER}', 'right'),
        (${FINISHED}, '${OTHER}', 'right');
      insert into public.versus_takes (matchup_id, user_id, body) values
        (${TODAY}, '${OTHER}', 'Today, unfinished.'),
        (${FINISHED}, '${OTHER}', 'Yesterday, finished.');
      insert into public.diary_entries
        (user_id, day, album_key, artist_name, album_name, release_mbid, sources) values
        ('${OTHER}', '2026-10-01', 'nas|illmatic', 'Nas', 'Illmatic', '${ILLMATIC}', '{spotify}'),
        ('${OTHER}', '2026-10-02', 'buy|spam', 'Buy', 'Spam at example.com', null, '{spotify}');
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

  async function asServer<T>(sql: string): Promise<T[]> {
    await db.exec("set role service_role");
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  }

  const votes = `select user_id::text from public.versus_votes where matchup_id = ${TODAY}`;
  const takes = `select body from public.versus_takes where matchup_id = ${TODAY}`;

  it("runs twice without complaint", async () => {
    await db.exec(migrationSql("0028_held_by_the_database.sql"));
  });

  describe("a Versus still open", () => {
    it("shows nobody signed out how it's going", async () => {
      expect(await as(null, votes)).toEqual([]);
      expect(await as(null, takes)).toEqual([]);
    });

    it("shows nothing to somebody who hasn't picked", async () => {
      expect(await as(ME, votes)).toEqual([]);
      expect(await as(ME, takes)).toEqual([]);
    });

    it("opens up to somebody who has", async () => {
      expect(await as(PICKER, votes)).toHaveLength(2);
      expect(await as(PICKER, takes)).toEqual([{ body: "Today, unfinished." }]);
    });

    it("lets somebody pick, and read their pick back", async () => {
      const rows = await as<{ pick: string }>(
        ME,
        `insert into public.versus_votes (matchup_id, user_id, pick)
         values (${TODAY}, '${ME}', 'left') returning pick`,
      );
      expect(rows).toEqual([{ pick: "left" }]);
      expect(await as(ME, votes)).toHaveLength(3);
      await asServer(`delete from public.versus_votes where user_id = '${ME}'`);
    });

    it("leaves the website able to read it all, to answer after its own check", async () => {
      expect(await asServer(votes)).toHaveLength(2);
      expect(await asServer(takes)).toHaveLength(1);
    });
  });

  describe("a finished Versus", () => {
    it("is public, signed in or out", async () => {
      const finishedVotes = `select pick from public.versus_votes where matchup_id = ${FINISHED}`;
      const finishedTakes = `select body from public.versus_takes where matchup_id = ${FINISHED}`;
      for (const viewer of [null, ME]) {
        expect(await as(viewer, finishedVotes)).toEqual([{ pick: "right" }]);
        expect(await as(viewer, finishedTakes)).toEqual([{ body: "Yesterday, finished." }]);
      }
    });
  });

  describe("a diary", () => {
    const names = (user: string) =>
      `select album_name from public.diary_entries where user_id = '${user}' order by day`;

    it("shows others only the albums matched to a record", async () => {
      expect(await as(null, names(OTHER))).toEqual([{ album_name: "Illmatic" }]);
      expect(await as(ME, names(OTHER))).toEqual([{ album_name: "Illmatic" }]);
    });

    it("shows its owner everything", async () => {
      expect(await as(OTHER, names(OTHER))).toHaveLength(2);
    });

    it("counts a month the same way", async () => {
      const months = `select albums from public.diary_months('${OTHER}', '2026-10-01', '2026-10-31')`;
      expect(await as(ME, months)).toEqual([{ albums: 1 }]);
      expect(await as(OTHER, months)).toEqual([{ albums: 2 }]);
    });
  });

  describe("a picture", () => {
    const LOOKS_RIGHT = `https://attacker.supabase.co/storage/v1/object/public/avatars/${OTHER}/avatar.jpg`;

    it("can't be pointed anywhere with a person's own session", async () => {
      await expect(
        as(ME, `update public.profiles set avatar_url = '${LOOKS_RIGHT}' where id = '${ME}'`),
      ).rejects.toThrow(/permission denied/);
    });

    it("is still set by the website", async () => {
      await asServer(
        `update public.profiles set avatar_url = '/records/${ILLMATIC}' where id = '${ME}'`,
      );
      const [row] = await asServer<{ avatar_url: string }>(
        `select avatar_url from public.profiles where id = '${ME}'`,
      );
      expect(row?.avatar_url).toBe(`/records/${ILLMATIC}`);
    });

    it("leaves the rest of a profile's own settings alone", async () => {
      await as(ME, `update public.profiles set diary_public = false where id = '${ME}'`);
      await as(ME, `update public.profiles set raised_era = '90s' where id = '${ME}'`);
    });
  });

  describe("when a score was given", () => {
    it.each([
      [
        "an album",
        `insert into public.ratings (user_id, release_mbid, score, created_at)
         values ('${ME}', '${STILLMATIC}', 7, '2099-01-01')`,
      ],
      [
        "an artist",
        `insert into public.artist_ratings (user_id, artist_mbid, score, created_at)
         values ('${ME}', '${JAY}', 7, '2099-01-01')`,
      ],
      [
        "a song",
        `insert into public.song_ratings (user_id, song_mbid, release_mbid, score, created_at)
         values ('${ME}', '${SONG}', '${ILLMATIC}', 7, '2099-01-01')`,
      ],
      [
        "an album, moved later",
        `update public.ratings set created_at = '2099-01-01' where user_id = '${ME}'`,
      ],
      [
        "an album, touched later",
        `update public.ratings set updated_at = '2099-01-01' where user_id = '${ME}'`,
      ],
    ])("can't be made up for %s", async (_what, sql) => {
      await expect(as(ME, sql)).rejects.toThrow(/permission denied/);
    });

    it("is the database's own, as the website's scores are saved", async () => {
      await as(
        ME,
        `insert into public.ratings (user_id, release_mbid, score)
         values ('${ME}', '${STILLMATIC}', 7)
         on conflict (user_id, release_mbid)
         do update set user_id = excluded.user_id,
                       release_mbid = excluded.release_mbid,
                       score = excluded.score`,
      );
      await as(
        ME,
        `insert into public.artist_ratings (user_id, artist_mbid, score)
         values ('${ME}', '${JAY}', 6)
         on conflict (user_id, artist_mbid)
         do update set user_id = excluded.user_id,
                       artist_mbid = excluded.artist_mbid,
                       score = excluded.score`,
      );
      await as(
        ME,
        `insert into public.song_ratings (user_id, song_mbid, release_mbid, score)
         values ('${ME}', '${SONG_2}', '${ILLMATIC}', 8)
         on conflict (user_id, song_mbid)
         do update set user_id = excluded.user_id,
                       song_mbid = excluded.song_mbid,
                       release_mbid = excluded.release_mbid,
                       score = excluded.score`,
      );
      const [row] = await asServer<{ future: boolean }>(
        `select created_at > now() + interval '1 day' as future from public.ratings
         where user_id = '${ME}' and release_mbid = '${STILLMATIC}'`,
      );
      expect(row?.future).toBe(false);
    });

    it("lets somebody take a song's score back", async () => {
      await as(
        ME,
        `delete from public.song_ratings where user_id = '${ME}' and song_mbid = '${SONG_2}'`,
      );
    });
  });

  describe("the way back in docs/supabase-setup.md", () => {
    const section = readFileSync("docs/supabase-setup.md", "utf8").split("## 12.")[1] ?? "";
    const blocks = [...section.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
    const undo = blocks.at(-1) ?? "";

    it("puts the rules back, and 0028 can run again after it", async () => {
      await db.exec(undo);
      expect(await as(null, takes)).toEqual([{ body: "Today, unfinished." }]);
      await as(ME, `update public.ratings set created_at = created_at where user_id = '${ME}'`);

      await db.exec(migrationSql("0028_held_by_the_database.sql"));
      expect(await as(null, takes)).toEqual([]);
    });

    it("gives a picture check that runs", async () => {
      await expect(db.query(blocks[0] ?? "")).resolves.toBeDefined();
    });
  });
});
