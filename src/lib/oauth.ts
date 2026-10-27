import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { OAuthProvider } from "@/lib/app-api";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Signing in through the browser from the phone app (`auth/oauth/start` and
 * `auth/oauth/exchange`). Supabase's PKCE flow keeps a secret verifier from
 * the start to the swap; rather than store it here, the website hands the
 * whole of Supabase's storage to the app as `state` and takes it back with the
 * code. Somebody who catches the `mulo://` link has the code but not the
 * verifier, so can't use it.
 */

/** What the app can sign in with through the browser. Facebook joins once Meta approves it. */
export const OAUTH_PROVIDERS = ["apple", "google"] as const satisfies readonly OAuthProvider[];
export const PROVIDER_OFF = "That sign-in isn't available yet.";
export const APP_REDIRECT = "mulo://auth/callback";

const STORAGE_KEY = "mulo-app-oauth";
const STATE_MAX = 8000;

/**
 * The keys auth-js keeps a PKCE flow under (`lib/helpers.js`): one slot per
 * flow, the list of flows, and the older single key it still writes. A
 * session or user key is never one of them.
 */
const VERIFIER_KEY = new RegExp(`^${STORAGE_KEY}-(flow-[\\w-]{8,64}-|flows-)?code-verifier$`);
const FLOW_SLOT = new RegExp(`^${STORAGE_KEY}-flow-([\\w-]{8,64})-code-verifier$`);

/**
 * What to ask each provider for. Apple only shares a name and email when
 * asked, and only the first time. When somebody is confirming it's them
 * (`confirm`), Google is told to show its account chooser rather than sign
 * straight back in, so a Google session left open on a borrowed laptop or
 * phone can't confirm it with nobody looking. Apple's sign-in in the browser
 * always asks.
 */
export function providerOptions(
  provider: (typeof OAUTH_PROVIDERS)[number],
  confirm: boolean,
): { scopes?: string; queryParams?: Record<string, string> } {
  if (provider === "apple") return { scopes: "name email" };
  return confirm ? { queryParams: { prompt: "select_account" } } : {};
}

/** Whether this sign-in is open yet. */
export function providerOn(provider: OAuthProvider): provider is (typeof OAUTH_PROVIDERS)[number] {
  return OAUTH_PROVIDERS.some((on) => on === provider);
}

/**
 * Whether `address` is the app's own return address, exactly
 * `mulo://auth/callback`. Expo Go's `exp://` addresses are refused on every
 * deployment: any app or page can claim one, so a sign-in sent there could be
 * caught by somebody else. Develop sign-in on a development build, which opens
 * `mulo://` itself.
 *
 * This check only stops the website starting a sign-in for anywhere else. The
 * real boundary is Supabase's list of Redirect URLs (Authentication → URL
 * Configuration), which decides where a code is ever sent: it must list
 * exactly `mulo://auth/callback` for the app, and never `exp://**`.
 */
export function allowedRedirect(address: string): boolean {
  return address === APP_REDIRECT;
}

type Store = Record<string, string>;

/**
 * Supabase's storage, kept in a plain object so it can travel to the app and
 * back. auth-js writes every value as a JSON string, the list of flows too.
 */
export function memoryStorage(initial: Readonly<Store> = {}) {
  const store: Store = { ...initial };
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    snapshot: (): string => JSON.stringify(store),
  };
}

/**
 * The storage `start` handed out, or null when it isn't what we sent: too
 * long, not an object of strings, or holding anything but a flow's verifier.
 */
export function restoreStorage(state: string): Store | null {
  if (state.length > STATE_MAX) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(state);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const entries: [string, unknown][] = Object.entries(parsed);
  if (entries.length === 0) return null;
  const store: Store = {};
  for (const [key, value] of entries) {
    if (!VERIFIER_KEY.test(key) || typeof value !== "string") return null;
    store[key] = value;
  }
  return store;
}

/**
 * The one flow a restored storage holds. Supabase only puts the flow id on
 * the return address when asked to, and asking would break an exact match in
 * its list of allowed addresses, so the app usually can't send it.
 */
export function pendingFlow(store: Readonly<Store>): string | undefined {
  const ids = Object.keys(store).flatMap((key) => FLOW_SLOT.exec(key)?.[1] ?? []);
  return ids.length === 1 ? ids[0] : undefined;
}

/**
 * A PKCE client over the given storage. `persistSession` has to be on, or
 * auth-js ignores `storage` and keeps the verifier in memory of its own; the
 * session it saves there after the swap is thrown away with the request.
 */
export function oauthClient(storage: ReturnType<typeof memoryStorage>) {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: STORAGE_KEY,
      storage,
    },
  });
}
