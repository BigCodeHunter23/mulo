#!/usr/bin/env node
/**
 * Fills in the starting score for albums and artists already in MULO's
 * catalogue.
 *
 * New records pick one up on the way in, because `catalog.ts` now asks
 * MusicBrainz for ratings alongside everything else it fetches. Records
 * cached before that never go back to MusicBrainz — that's the whole point of
 * the cache — so without this they would sit at a dash forever. This walks the
 * ones with no seed yet and asks for theirs.
 *
 * MusicBrainz rates out of five and MULO out of ten, so the value is doubled.
 * A rating fewer than three people voted on is left alone: a five out of five
 * from one person is noise, not a starting point.
 *
 * At roughly one request a second a few thousand records takes an hour or two.
 * It is safe to stop and run again — anything already seeded is skipped — and
 * safe to run repeatedly as the catalogue grows.
 *
 * Run migration 0014_seed_ratings.sql first, then:
 *
 *   node --env-file=.env.local scripts/seed-scores.mjs
 *   node --env-file=.env.local scripts/seed-scores.mjs --limit=200 --only=artists
 */
import { createClient } from "@supabase/supabase-js";

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const LIMIT = Number(options.limit ?? 100000);
/** "albums", "artists", or both when not given. */
const ONLY = options.only ?? null;

/** Below this many MusicBrainz votes a rating is noise, not a starting point. */
const MIN_VOTES = 3;

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) =>
  console.log(new Date().toISOString().slice(11, 19), ...parts);

// MusicBrainz allows about one request a second and answers 503 when busy.
let lastRequest = 0;
async function musicbrainz(path) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    let response;
    try {
      response = await fetch(`https://musicbrainz.org/ws/2${path}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      await sleep(attempt * 2000);
      continue;
    }

    if (response.status === 503 || response.status === 429) {
      await sleep(attempt * 3000);
      continue;
    }
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
    return response.json();
  }
  throw new Error("MusicBrainz stayed busy");
}

/** MusicBrainz's nought-to-five into MULO's one-to-ten, or nothing. */
function seedFrom(rating) {
  const value = rating?.value;
  const votes = rating?.["votes-count"] ?? 0;
  if (typeof value !== "number" || value <= 0 || votes < MIN_VOTES) return null;

  return {
    seed_score: Math.min(10, Math.max(1, Math.round(value * 2 * 10) / 10)),
    seed_votes: votes,
    seed_source: "musicbrainz",
  };
}

/**
 * Supabase caps any one query at a thousand rows however big a limit you ask
 * for, so a catalogue bigger than that needs several passes. Each record is
 * marked as it's dealt with, so the next pass simply picks up whatever is
 * still unmarked — no page numbers to keep track of, and stopping partway
 * costs nothing.
 */
const PAGE = 1000;

async function backfill(kind) {
  const table = kind === "albums" ? "releases" : "artists";
  const path = kind === "albums" ? "release-group" : "artist";
  const label = kind === "albums" ? "album" : "artist";
  // `releases` has a title and `artists` a name; neither has the other.
  const naming = kind === "albums" ? "title" : "name";

  let seeded = 0;
  let skipped = 0;
  let done = 0;

  while (done < LIMIT) {
    // Most-played first, so a run stopped early has still done the records
    // people are most likely to open.
    const { data, error } = await supabase
      .from(table)
      .select(`mbid, ${naming}, popularity`)
      .is("seed_source", null)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(Math.min(PAGE, LIMIT - done));

    if (error) {
      if (error.message?.includes("seed_source")) {
        log(
          `Run migration 0014_seed_ratings.sql first — ${table} has no seed columns yet.`,
        );
        process.exit(1);
      }
      throw error;
    }

    const rows = data ?? [];
    if (rows.length === 0) break;
    log(`${label}s: ${rows.length} to go through in this batch.`);

    for (const row of rows) {
      const name = row.title ?? row.name ?? row.mbid;
      let mb;
      try {
        mb = await musicbrainz(`/${path}/${row.mbid}?inc=ratings&fmt=json`);
      } catch (problem) {
        log(`  ${name}: ${problem.message}`);
        // Leave it unmarked so a later run tries again, but step past it here
        // rather than asking for the same batch forever.
        await supabase
          .from(table)
          .update({ seed_source: "retry" })
          .eq("mbid", row.mbid);
        continue;
      }

      const seed = seedFrom(mb?.rating);
      if (!seed) {
        // Remember that we looked, so a rerun doesn't ask MusicBrainz again
        // for a record it has no useful rating for.
        await supabase
          .from(table)
          .update({ seed_source: "none" })
          .eq("mbid", row.mbid);
        skipped += 1;
      } else {
        await supabase.from(table).update(seed).eq("mbid", row.mbid);
        seeded += 1;
        log(`  ${name} → ${seed.seed_score} (${seed.seed_votes} votes)`);
      }

      done += 1;
      if (done % 100 === 0) log(`${done} ${label}s done so far.`);
    }
  }

  log(`${label}s finished: ${seeded} seeded, ${skipped} with nothing to borrow.`);
}

if (!ONLY || ONLY === "albums") await backfill("albums");
if (!ONLY || ONLY === "artists") await backfill("artists");
log("Done.");
