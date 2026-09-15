import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const ARCHIVE = "https://coverartarchive.org/release-group";
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";

type Downloaded =
  | { status: "ok"; type: "image/jpeg" | "image/png"; data: ArrayBuffer }
  | { status: "missing" }
  | { status: "failed" };

async function download(url: string): Promise<Downloaded> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (response.status === 404) return { status: "missing" };

    const type = (response.headers.get("content-type") ?? "").split(";")[0];
    // Anything but an image is an error page, not proof there's no cover.
    if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) {
      return { status: "failed" };
    }
    return { status: "ok", type, data: await response.arrayBuffer() };
  } catch {
    return { status: "failed" };
  }
}

/**
 * Copies a cover from the Cover Art Archive into MULO's storage and points
 * the release at it, or records that no cover exists. Runs after the page has
 * been sent, so nobody waits on archive.org for it.
 */
export async function copyCoverToStorage(mbid: string) {
  const large = await download(`${ARCHIVE}/${mbid}/front-500`);
  const admin = createAdminClient();

  if (large.status === "missing") {
    // An empty string means "looked, and there is no cover".
    await admin.from("releases").update({ cover_art_url: "" }).eq("mbid", mbid);
    return;
  }
  if (large.status === "failed") return;

  const small = await download(`${ARCHIVE}/${mbid}/front-250`);
  const ext = large.type === "image/png" ? "png" : "jpg";
  const bucket = admin.storage.from("covers");

  const { error } = await bucket.upload(`${mbid}/500.${ext}`, large.data, {
    contentType: large.type,
    upsert: true,
  });
  if (error) return;

  // Both sizes share an extension, so one can be swapped for the other.
  const smallFile =
    small.status === "ok" && small.type === large.type ? small : large;
  await bucket.upload(`${mbid}/250.${ext}`, smallFile.data, {
    contentType: smallFile.type,
    upsert: true,
  });

  const { data } = bucket.getPublicUrl(`${mbid}/500.${ext}`);
  await admin
    .from("releases")
    .update({ cover_art_url: data.publicUrl })
    .eq("mbid", mbid);
}
