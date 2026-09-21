#!/usr/bin/env node
/**
 * Marks albums whose artwork doesn't exist, so pages stop asking for it.
 *
 * An album cached from an artist's list keeps pointing at the Cover Art
 * Archive until copy-covers.mjs reaches it, and some of those records have no
 * cover at all — A$AP Rocky's ALL $MILE$ is one. The archive answers 404, the
 * browser draws its broken-image icon, and no amount of client-side handling
 * clears it reliably: the markup is server-rendered and React defers
 * hydrating a streamed boundary, so the error has come and gone before any
 * handler exists. Recording the absence is the fix.
 *
 * An empty cover_art_url means "looked, and there is nothing" — the same mark
 * copy-covers.mjs writes — and the app then renders the empty sleeve instead.
 * Only asks for the headers, so nothing is downloaded or stored. Safe to stop
 * and run again.
 *
 *   node --env-file=.env.local scripts/mark-missing-covers.mjs
 *   node --env-file=.env.local scripts/mark-missing-covers.mjs --limit=5000
 */
import { createClient } from "@supabase/supabase-js";

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const LIMIT = Number(options.limit ?? 30000);
const CONCURRENCY = Number(options.concurrency ?? 4);

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
const ARCHIVE = "https://coverartarchive.org/release-group";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

/** "gone" when the archive has no cover, "there" when it does, "unsure" otherwise. */
async function check(mbid) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${ARCHIVE}/${mbid}/front-250`, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 404) return "gone";
      if (response.ok) return "there";
      // 503 and friends are the archive being busy, not an answer.
      await sleep(attempt * 3000);
    } catch {
      await sleep(attempt * 3000);
    }
  }
  return "unsure";
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Run with: node --env-file=.env.local scripts/mark-missing-covers.mjs");
  }

  // A fixed list up front, so anything that fails isn't retried endlessly.
  const queue = [];
  for (let from = 0; queue.length < LIMIT; from += 1000) {
    const { data, error } = await supabase
      .from("releases")
      .select("mbid, title")
      .like("cover_art_url", `${ARCHIVE}/%`)
      .order("popularity", { ascending: false, nullsFirst: false })
      .order("mbid")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    queue.push(...data);
    if (data.length < 1000) break;
  }
  queue.splice(LIMIT);
  log(`${queue.length} covers to check`);

  let next = 0;
  let gone = 0;
  let there = 0;
  let unsure = 0;

  async function worker() {
    while (next < queue.length) {
      const index = ++next;
      const release = queue[index - 1];
      const result = await check(release.mbid);
      if (result === "gone") {
        gone++;
        await supabase.from("releases").update({ cover_art_url: "" }).eq("mbid", release.mbid);
        log(`${index}/${queue.length} ${release.title}: no cover, marked`);
      } else if (result === "there") {
        there++;
      } else {
        unsure++;
      }
      if (index % 200 === 0) {
        log(`${index}/${queue.length} — ${gone} marked, ${there} fine, ${unsure} unsure`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log(`Finished: ${gone} marked as having no cover, ${there} fine, ${unsure} to try again.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
