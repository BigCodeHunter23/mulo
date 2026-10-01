import "server-only";
import { siteUrl } from "@/lib/site";

/**
 * Fetching pictures on the server, for share images and record avatars.
 *
 * The addresses come from the database (covers, artist photos, avatars), and
 * a fetch made from the server is made with the server's network access, so
 * only the places MULO's pictures really live are allowed, every redirect is
 * checked the same way, and nothing large or unexpected is read.
 */

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";

/** Bigger than any cover, photo or avatar MULO uses, by a distance. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;

/** Formats the image renderer reads. Never SVG: it is a document, not a picture. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Where covers, artist photos and avatars are served from. */
const FIXED_HOSTS = [
  "coverartarchive.org",
  "archive.org", // Cover Art Archive redirects here, then to an *.archive.org server.
  "commons.wikimedia.org",
  "upload.wikimedia.org",
];

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Hosts allowed besides the fixed ones: this site, and its Supabase storage. */
function ownHosts(): string[] {
  return [hostOf(siteUrl()), hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL)].filter(
    (host): host is string => Boolean(host),
  );
}

export function isAllowedImageUrl(value: string, own: string[] = ownHosts()): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;

  // This site may be plain http in local development; everything else is https.
  if (own.includes(url.host)) return url.protocol === "https:" || url.protocol === "http:";
  if (url.protocol !== "https:" || url.port) return false;

  const host = url.hostname;
  return FIXED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export type FetchedImage = { type: string; data: ArrayBuffer; url: string };

/** Reads a body, giving up past the limit rather than holding it all. */
async function readCapped(response: Response): Promise<ArrayBuffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** A picture from one of the allowed places, or null for anything else. */
export async function fetchImage(start: string): Promise<FetchedImage | null> {
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedImageUrl(url)) return null;

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        url = new URL(location, url).toString();
        continue;
      }

      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!response.ok || !IMAGE_TYPES.includes(type)) return null;

      const data = await readCapped(response);
      return data ? { type, data, url } : null;
    }
  } catch {
    return null;
  }
  return null;
}
