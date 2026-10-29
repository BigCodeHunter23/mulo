import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Play } from "@/lib/diary-shared";
import { readTimeZone, touchClock } from "@/lib/push/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Last.fm: the approval page that proves an account is yours, and reading
 * somebody's plays, which are public. The session Last.fm gives back only
 * proves whose account it is; it's never kept. Keys come from LASTFM_API_KEY
 * and LASTFM_API_SECRET; without them, Connect Last.fm isn't offered.
 */

const API = "https://ws.audioscrobbler.com/2.0/";
const AUTH = "https://www.last.fm/api/auth/";
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
/** Last.fm's most per page. */
export const PAGE_LIMIT = 200;
/** How long a connect may take, from Connect to coming back. */
const STATE_MINUTES = 10;

/** What Connect Last.fm says before the website has its keys. */
export const LASTFM_OFF = "Last.fm isn't set up yet.";

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

/** Swaps the token Last.fm sent back for the account's name, proving it's theirs. */
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

/** `totalPages` is null when Last.fm didn't say, which is no answer to go on. */
export type RecentPage = { page: number; totalPages: number | null; plays: Play[] };

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
  const totalPages = String(attr?.totalPages ?? "");
  return {
    page: Number(attr?.page ?? options.page) || options.page,
    totalPages: /^\d{1,9}$/.test(totalPages) ? Number(totalPages) : null,
    plays,
  };
}

export const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");

/**
 * A connect started on the website is finished only in the browser that
 * started it, so nobody can send somebody else a link that connects their
 * Last.fm to the sender's MULO. This cookie (path /diary/lastfm, ten
 * minutes) holds a hash of the state, unlike the one kept in the database.
 * The app's browser sheet has no cookies; its connects rely on the
 * single-use state.
 */
export const CONNECT_COOKIE = "mulo_lastfm";
export const CONNECT_COOKIE_PATH = "/diary/lastfm";
export const CONNECT_COOKIE_SECONDS = STATE_MINUTES * 60;

export const connectCookie = (state: string) =>
  createHash("sha256").update(`browser:${state}`).digest("hex");

/** Whether the cookie came from the browser that started this state's connect. */
export function sameBrowser(cookie: string | undefined, state: string): boolean {
  if (!cookie) return false;
  const given = Buffer.from(cookie);
  const wanted = Buffer.from(connectCookie(state));
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Starts connecting: a single-use state naming the person, kept only as a
 * hash for ten minutes, where to go back to afterwards, and the time zone it
 * started in (a new import reads days on that clock).
 */
export async function createConnectState(
  userId: string,
  to: "web" | "app",
  timeZone: string | null = null,
): Promise<string> {
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
        pending_zone: timeZone,
      },
      { onConflict: "user_id,source" },
    );
  if (error) throw error;
  return state;
}

/**
 * Notes the zone a connect started in as the person's own when none is kept
 * yet (they've never had pushes, say), for streaks and the like. Never stops
 * a connect.
 */
export async function noteTimeZone(userId: string, timeZone: string | null): Promise<void> {
  if (!timeZone) return;
  try {
    if (!(await readTimeZone(userId))) await touchClock(userId, timeZone);
  } catch (error) {
    console.error("[diary] noting the time zone failed:", error);
  }
}

export type ConnectStarted = { userId: string; to: "web" | "app"; timeZone: string | null };

/**
 * Takes a connect's state once: who started it, where they go back to and
 * the zone they were in; null for a state that's used, expired or made up.
 * Throws when the states can't be read.
 */
export async function takeConnectState(state: string): Promise<ConnectStarted | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return null;
  const client = createAdminClient();
  const hash = stateHash(state);
  const { data: found, error: readError } = await client
    .from("diary_sources")
    .select("user_id, pending_to, pending_zone")
    .eq("source", "lastfm")
    .eq("pending_hash", hash)
    .gt("pending_until", new Date().toISOString())
    .maybeSingle();
  if (readError) throw readError;
  if (!found) return null;
  // Cleared only if it's still there, so two callbacks racing can't both win.
  const { data: taken, error } = await client
    .from("diary_sources")
    .update({ pending_hash: null, pending_until: null, pending_to: null, pending_zone: null })
    .eq("source", "lastfm")
    .eq("pending_hash", hash)
    .select("user_id");
  if (error) throw error;
  if (!taken || taken.length === 0) return null;
  return {
    userId: found.user_id,
    to: found.pending_to === "app" ? "app" : "web",
    timeZone: found.pending_zone,
  };
}

/**
 * Saves a connected account by its name. The same account keeps its
 * progress and its clock: an import it hadn't finished carries on, and one
 * that had goes back to syncing. Another account starts its import from now,
 * back to the start, on the clock it connected on.
 */
export async function saveConnection(
  userId: string,
  account: { user: string },
  timeZone: string | null,
  at = new Date(),
): Promise<void> {
  const client = createAdminClient();
  const { data: existing, error: readError } = await client
    .from("diary_sources")
    .select("lastfm_user, import_page, time_zone")
    .eq("user_id", userId)
    .eq("source", "lastfm")
    .maybeSingle();
  if (readError) throw readError;
  const same = existing?.lastfm_user?.toLowerCase() === account.user.toLowerCase();
  const fresh = {
    state: "importing",
    import_to: at.toISOString(),
    import_page: 1,
    import_added: 0,
    carry: null,
    reached_back: null,
    synced_to: at.toISOString(),
    time_zone: timeZone,
  };
  const carryOn = {
    state: existing?.import_page ? "importing" : "syncing",
    ...(existing?.time_zone || !timeZone ? {} : { time_zone: timeZone }),
  };
  const { error } = await client.from("diary_sources").upsert(
    {
      user_id: userId,
      source: "lastfm",
      lastfm_user: account.user,
      ...(same ? carryOn : fresh),
    },
    { onConflict: "user_id,source" },
  );
  if (error) throw error;
}
