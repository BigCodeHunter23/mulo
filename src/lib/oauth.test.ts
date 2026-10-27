import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  allowedRedirect,
  APP_REDIRECT,
  memoryStorage,
  oauthClient,
  pendingFlow,
  restoreStorage,
} from "./oauth";

const KEY = "mulo-app-oauth";
const FLOW = "0123456789abcdef0123456789abcdef";
const SLOT = `${KEY}-flow-${FLOW}-code-verifier`;

/** What auth-js leaves in storage after starting one sign-in: every value is JSON. */
const started = {
  [SLOT]: JSON.stringify("the-verifier"),
  [`${KEY}-flows-code-verifier`]: JSON.stringify([FLOW]),
  [`${KEY}-code-verifier`]: JSON.stringify("the-verifier"),
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("allowedRedirect", () => {
  it("allows the app's own return address", () => {
    expect(allowedRedirect(APP_REDIRECT)).toBe(true);
    expect(allowedRedirect("mulo://auth/callback")).toBe(true);
  });

  it("allows Expo's development address outside production only", () => {
    const expo = "exp://192.168.1.7:8081/--/auth/callback";
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(allowedRedirect(expo)).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(allowedRedirect(expo)).toBe(false);
    expect(allowedRedirect(APP_REDIRECT)).toBe(true);
  });

  it("refuses anywhere else", () => {
    expect(allowedRedirect("https://evil.example/cb")).toBe(false);
    expect(allowedRedirect("mulo://elsewhere")).toBe(false);
    expect(allowedRedirect("mulo://auth/callback?next=https://evil.example")).toBe(false);
    expect(allowedRedirect("exp://evil.example/--/auth/callback?x=1")).toBe(false);
    expect(allowedRedirect("exp://evil.example/--/auth/callback#x")).toBe(false);
    expect(allowedRedirect("exp://user@evil.example/--/auth/callback")).toBe(false);
    expect(allowedRedirect("")).toBe(false);
  });
});

describe("memoryStorage", () => {
  it("keeps, gives back and forgets values", () => {
    const storage = memoryStorage();
    expect(storage.getItem("a")).toBeNull();
    storage.setItem("a", "1");
    expect(storage.getItem("a")).toBe("1");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
  });

  it("starts from what it's given, without changing it", () => {
    const initial = { a: "1" };
    const storage = memoryStorage(initial);
    storage.setItem("b", "2");
    expect(storage.getItem("a")).toBe("1");
    expect(initial).toEqual({ a: "1" });
  });

  it("writes itself out as a JSON string", () => {
    const storage = memoryStorage();
    storage.setItem("a", "1");
    expect(JSON.parse(storage.snapshot())).toEqual({ a: "1" });
  });
});

describe("restoreStorage", () => {
  it("gives back what start handed out", () => {
    expect(restoreStorage(JSON.stringify(started))).toEqual(started);
  });

  it("refuses anything that isn't a plain object of strings", () => {
    expect(restoreStorage("not json")).toBeNull();
    expect(restoreStorage("null")).toBeNull();
    expect(restoreStorage('"text"')).toBeNull();
    expect(restoreStorage("42")).toBeNull();
    expect(restoreStorage(JSON.stringify([SLOT]))).toBeNull();
    expect(restoreStorage(JSON.stringify({ [SLOT]: 1 }))).toBeNull();
    expect(restoreStorage(JSON.stringify({ [SLOT]: ["x"] }))).toBeNull();
    expect(restoreStorage(JSON.stringify({ [SLOT]: null }))).toBeNull();
  });

  it("refuses keys that aren't a sign-in's own", () => {
    expect(restoreStorage(JSON.stringify({ ...started, other: '"x"' }))).toBeNull();
    expect(restoreStorage(JSON.stringify({ "sb-ref-auth-token-code-verifier": '"x"' }))).toBeNull();
  });

  it("refuses a session slipped in beside the verifier", () => {
    expect(
      restoreStorage(JSON.stringify({ ...started, [KEY]: '{"access_token":"x"}' })),
    ).toBeNull();
    expect(restoreStorage(JSON.stringify({ ...started, [`${KEY}-user`]: "{}" }))).toBeNull();
  });

  it("refuses an empty state", () => {
    expect(restoreStorage("{}")).toBeNull();
  });

  it("refuses a state over 8000 characters", () => {
    const long = JSON.stringify({ [SLOT]: JSON.stringify("x".repeat(8000)) });
    expect(restoreStorage(long)).toBeNull();
  });
});

describe("pendingFlow", () => {
  it("names the one sign-in the state holds", () => {
    expect(pendingFlow(started)).toBe(FLOW);
  });

  it("names none when there isn't exactly one", () => {
    expect(pendingFlow({ [`${KEY}-code-verifier`]: '"v"' })).toBeUndefined();
    const second = `${KEY}-flow-fedcba9876543210fedcba9876543210-code-verifier`;
    expect(pendingFlow({ ...started, [second]: '"w"' })).toBeUndefined();
  });
});

/** The real auth-js, so a change in how it keeps the verifier fails here. */
describe("oauthClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  async function start() {
    const storage = memoryStorage();
    const { data, error } = await oauthClient(storage).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: APP_REDIRECT, skipBrowserRedirect: true },
    });
    expect(error).toBeNull();
    return { url: new URL(data.url ?? ""), state: storage.snapshot() };
  }

  it("keeps only the verifier in the storage it's given, and asks for S256", async () => {
    const { url, state } = await start();
    const keys = Object.keys(JSON.parse(state));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^mulo-app-oauth-.*code-verifier$/);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("redirect_to")).toBe(APP_REDIRECT);
    expect(restoreStorage(state)).not.toBeNull();
  });

  it("swaps the code with the verifier start kept", async () => {
    const { url, state } = await start();
    const restored = restoreStorage(state);
    if (!restored) throw new Error("state didn't restore");

    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "user-1", email: "someone@example.com" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const storage = memoryStorage(restored);
    const { data, error } = await oauthClient(storage).auth.exchangeCodeForSession("the-code", {
      flowId: pendingFlow(restored) ?? "",
    });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBe("access");

    const body = z.object({ auth_code: z.string(), code_verifier: z.string() }).parse(sent[0]);
    expect(body.auth_code).toBe("the-code");
    const challenge = createHash("sha256").update(body.code_verifier).digest("base64url");
    expect(challenge).toBe(url.searchParams.get("code_challenge"));
  });
});
