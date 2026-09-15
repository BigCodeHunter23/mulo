#!/usr/bin/env node
/**
 * Copies album covers from the Cover Art Archive into MULO's own storage, so
 * they load from Supabase's CDN instead of being fetched via archive.org, and
 * records albums that have no cover at all so pages stop asking for one.
 *
 * Works through the most popular albums first. Safe to stop and run again:
 * a copied cover no longer points at the archive, so it isn't picked up twice.
 *
 *   node --env-file=.env.local scripts/copy-covers.mjs --limit=2000
 */
import { createClient } from "@supabase/supabase-js";

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const LIMIT = Number(options.limit ?? 2000);
const CONCURRENCY = Number(options.concurrency ?? 4);

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
const ARCHIVE = "https://coverartarchive.org/release-group";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) =>
  console.log(new Date().toISOString().slice(11, 19), ...parts);

/** "ok" with the image, "missing" if no cover exists, "failed" to retry. */
async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(45000),
      });
      if (response.status === 404) return { status: "missing" };
      if (!response.ok) {
        await sleep(attempt * 3000);
        continue;
      }

      const type = (response.headers.get("content-type") ?? "").split(";")[0];
      // Anything but an image here is an error page, not proof there's no cover.
      if (type !== "image/jpeg" && type !== "image/png") return { status: "failed" };

      return {
        status: "ok",
        type,
        data: Buffer.from(await response.arrayBuffer()),
      };
    } catch {
      await sleep(attempt * 3000);
    }
  }
  return { status: "failed" };
}

async function upload(path, file) {
  const { error } = await supabase.storage
    .from("covers")
    .upload(path, file.data, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
}

const extension = (file) => (file.type === "image/png" ? "png" : "jpg");

async function copy(release) {
  const large = await download(`${ARCHIVE}/${release.mbid}/front-500`);

  if (large.status === "missing") {
    // An empty string means "looked, and there is no cover".
    await supabase.from("releases").update({ cover_art_url: "" }).eq("mbid", release.mbid);
    return "no cover exists";
  }
  if (large.status === "failed") return "download failed, will retry next run";

  const small = await download(`${ARCHIVE}/${release.mbid}/front-250`);
  const ext = extension(large);

  const largeUrl = await upload(`${release.mbid}/500.${ext}`, large);
  // Both sizes share an extension, so the app can swap one for the other.
  await upload(
    `${release.mbid}/250.${ext}`,
    small.status === "ok" && extension(small) === ext ? small : large,
  );

  await supabase.from("releases").update({ cover_art_url: largeUrl }).eq("mbid", release.mbid);
  return "copied";
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Run with: node --env-file=.env.local scripts/copy-covers.mjs");
  }

  // Take a fixed list up front, so covers that fail aren't retried endlessly.
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
  log(`${queue.length} covers to copy`);

  let next = 0;
  let copied = 0;
  let missing = 0;
  let failed = 0;

  async function worker() {
    while (next < queue.length) {
      const index = ++next;
      const release = queue[index - 1];
      try {
        const result = await copy(release);
        if (result === "copied") copied++;
        else if (result === "no cover exists") missing++;
        else failed++;
        log(`${index}/${queue.length} ${release.title}: ${result}`);
      } catch (error) {
        failed++;
        log(`${index}/${queue.length} ${release.title} failed: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log(`Finished: ${copied} copied, ${missing} with no cover, ${failed} to retry.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
