import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Play } from "@/lib/diary-shared";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Last.fm: the approval page that proves an account is yours, the session it
 * gives back, and reading somebody's plays. Keys come from LASTFM_API_KEY and
 * LASTFM_API_SECRET; without them, Connect Last.fm isn't offered.
 */

const API = "https://ws.audioscrobbler.com/2.0/";
const AUTH = "https://www.last.fm/api/auth/";
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
/** Last.fm's most per page. */
export const PAGE_LIMIT = 200;
/** How long a connect may take, from Connect to coming back. */
const STATE_MINUTES = 10;

export type LastfmKeys = { key: string; secret: string };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function lastfmKeys(): LastfmKeys | null {
  const key = process.env.LASTFM_API_KEY;
  const secret = process.env.LASTFM_API_SECRET;
  return key && secret ? { key, secret } : null;
}

export class LastfmError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "LastfmError";
  }
}

/**
 * Codes that mean this account can't be read until it's connected again:
 * bad or expired session or token (4, 9, 14, 15), no such user (6), or a
 * listening history they've made private (17).
 */
const RECONNECT = new Set([4, 6, 9, 14, 15, 17]);
export const needsReconnect = (error: unknown) =>
  error instanceof LastfmError && RECONNECT.has(error.code);

/** Last.fm's `api_sig`: every parameter but format and callback, by name, then the secret. */
export function signature(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .filter((name) => name !== "format" && name !== "callback")
    .sort()
    .map((name) => `${name}${params[name]}`)
    .join("");
  return createHash("md5")
    .update(base + secret, "utf8")
    .digest("hex");
}

async function call<T extends object>(
  params: Record<string, string>,
  keys: LastfmKeys,
  fetcher: Fetcher,
): Promise<T> {
  const query = new URLSearchParams({ ...params, api_key: keys.key, format: "json" });
  const response = await fetcher(`${API}?${query}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error, message } = body as { error: unknown; message?: unknown };
    if (typeof error === "number") {
      throw new LastfmError(error, String(message ?? "Last.fm refused"));
    }
  }
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new LastfmError(0, `Last.fm answered ${response.status}`);
  }
  // Last.fm's answers are read field by field below, each one checked.
  return body as T;
}

/** Last.fm's approval page, coming back to `callback` with a token. */
export function approvalUrl(keys: LastfmKeys, callback: string): string {
  return `${AUTH}?${new URLSearchParams({ api_key: keys.key, cb: callback })}`;
}

/** Swaps the token Last.fm sent back for the account's name and session key. */
export async function sessionFor(
  token: string,
  keys: LastfmKeys,
  fetcher: Fetcher = fetch,
): Promise<{ user: string; key: string }> {
  const params = { method: "auth.getSession", token, api_key: keys.key };
  const body = await call<{ session?: { name?: string; key?: string } }>(
    { ...params, api_sig: signature(params, keys.secret) },
    keys,
    fetcher,
  );
  const user = body.session?.name;
  const key = body.session?.key;
  if (typeof user !== "string" || !user || typeof key !== "string" || !key) {
    throw new LastfmError(0, "Last.fm gave no session");
  }
  return { user, key };
}

type LfTrack = {
  name?: string;
  artist?: { "#text"?: string; name?: string };
  album?: { "#text"?: string };
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};

export type RecentPage = { page: number; totalPages: number; plays: Play[] };

/** One page of somebody's plays, newest first. `from` and `to` are in seconds. */
export async function recentTracks(
  user: string,
  options: { page: number; from?: number; to?: number },
  keys: LastfmKeys,
  fetcher: Fetcher = fetch,
): Promise<RecentPage> {
  const params: Record<string, string> = {
    method: "user.getRecentTracks",
    user,
    limit: String(PAGE_LIMIT),
    page: String(options.page),
  };
  if (options.from !== undefined) params.from = String(Math.floor(options.from));
  if (options.to !== undefined) params.to = String(Math.floor(options.to));
  const body = await call<{
    recenttracks?: {
      track?: LfTrack | LfTrack[];
      "@attr"?: { page?: string; totalPages?: string };
    };
  }>(params, keys, fetcher);

  // A page of one track comes as the track itself rather than a list.
  const raw = body.recenttracks?.track;
  const tracks = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const plays: Play[] = [];
  for (const track of tracks) {
    // The song playing now has no time yet; it's counted once it's played.
    if (track["@attr"]?.nowplaying === "true") continue;
    const uts = Number(track.date?.uts);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    plays.push({
      at: uts * 1000,
      artist: String(track.artist?.["#text"] ?? track.artist?.name ?? ""),
      album: String(track.album?.["#text"] ?? ""),
      song: String(track.name ?? ""),
      ms: null,
    });
  }
  const attr = body.recenttracks?.["@attr"];
  return {
    page: Number(attr?.page ?? options.page) || options.page,
    totalPages: Number(attr?.totalPages ?? 0) || 0,
    plays,
  };
}

export const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");

/**
 * Starts connecting: a single-use state naming the person, kept only as a
 * hash for ten minutes, and where to go back to afterwards.
 */
export async function createConnectState(userId: string, to: "web" | "app"): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const { error } = await createAdminClient()
    .from("diary_sources")
    .upsert(
      {
        user_id: userId,
        source: "lastfm",
        pending_hash: stateHash(state),
        pending_until: new Date(Date.now() + STATE_MINUTES * 60_000).toISOString(),
        pending_to: to,
      },
      { onConflict: "user_id,source" },
    );
  if (error) throw error;
  return state;
}

/** Takes a connect's state once: who started it and where they go back to, or null. */
export async function takeConnectState(
  state: string,
): Promise<{ userId: string; to: "web" | "app" } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return null;
  const client = createAdminClient();
  const hash = stateHash(state);
  const { data: found } = await client
    .from("diary_sources")
    .select("user_id, pending_to")
    .eq("source", "lastfm")
    .eq("pending_hash", hash)
    .gt("pending_until", new Date().toISOString())
    .maybeSingle();
  if (!found) return null;
  // Cleared only if it's still there, so two callbacks racing can't both win.
  const { data: taken, error } = await client
    .from("diary_sources")
    .update({ pending_hash: null, pending_until: null, pending_to: null })
    .eq("source", "lastfm")
    .eq("pending_hash", hash)
    .select("user_id");
  if (error || !taken || taken.length === 0) return null;
  return { userId: found.user_id, to: found.pending_to === "app" ? "app" : "web" };
}

/**
 * Saves a connected account. The same account keeps its progress: an import
 * it hadn't finished carries on, and one that had goes back to syncing.
 * Another account starts its import from now, back to the start.
 */
export async function saveConnection(
  userId: string,
  session: { user: string; key: string },
  at = new Date(),
): Promise<void> {
  const client = createAdminClient();
  const { data: existing } = await client
    .from("diary_sources")
    .select("lastfm_user, import_page")
    .eq("user_id", userId)
    .eq("source", "lastfm")
    .maybeSingle();
  const same = existing?.lastfm_user?.toLowerCase() === session.user.toLowerCase();
  const fresh = {
    state: "importing",
    import_to: at.toISOString(),
    import_page: 1,
    import_added: 0,
    carry: null,
    reached_back: null,
    synced_to: at.toISOString(),
  };
  const { error } = await client.from("diary_sources").upsert(
    {
      user_id: userId,
      source: "lastfm",
      lastfm_user: session.user,
      lastfm_session: session.key,
      ...(same ? { state: existing?.import_page ? "importing" : "syncing" } : fresh),
    },
    { onConflict: "user_id,source" },
  );
  if (error) throw error;
}
