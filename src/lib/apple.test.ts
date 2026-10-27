import { generateKeyPairSync, randomBytes, verify, type KeyObject } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientSecret,
  exchangeAppleCode,
  hasTokenKey,
  jwtSubject,
  openToken,
  revokeAppleToken,
  sealToken,
} from "./apple";

const TEAM = "TEAM123456";
const KID = "KEY1234567";
const CLIENT = "com.mulo.app";

const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKey: KeyObject = pair.publicKey;
const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function setSettings(overrides: Record<string, string> = {}) {
  const settings: Record<string, string> = {
    APPLE_TEAM_ID: TEAM,
    APPLE_KEY_ID: KID,
    APPLE_PRIVATE_KEY: privatePem,
    APPLE_TOKEN_KEY: randomBytes(32).toString("base64"),
    ...overrides,
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
}

const decode = (part: string): unknown => JSON.parse(Buffer.from(part, "base64url").toString());

function sentForm(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, form: new URLSearchParams(String(init.body)) };
}

const fetchMock = vi.fn();

/** A JWT shaped like Apple's id_token. Only the payload is read; Apple's signature isn't checked here. */
const idToken = (payload: unknown) =>
  `${Buffer.from('{"alg":"RS256","kid":"k"}').toString("base64url")}.${Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url")}.c2lnbmF0dXJl`;
const APPLE_USER = "001234.abcdef0123456789.0123";

/** Apple's answer to a code swap. */
const swapped = (extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      refresh_token: "r-token",
      access_token: "a",
      id_token: idToken({ iss: "https://appleid.apple.com", sub: APPLE_USER }),
      ...extra,
    }),
    { status: 200 },
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("clientSecret", () => {
  function checkSecret(secret: string | null) {
    expect(secret).not.toBeNull();
    const parts = (secret ?? "").split(".");
    expect(parts).toHaveLength(3);
    const [header, payload, signature] = parts as [string, string, string];
    expect(decode(header)).toEqual({ alg: "ES256", kid: KID });
    const claims = decode(payload) as Record<string, number | string>;
    expect(claims).toMatchObject({ iss: TEAM, sub: CLIENT, aud: "https://appleid.apple.com" });
    const iat = Number(claims.iat);
    const exp = Number(claims.exp);
    expect(iat).toBeGreaterThan(0);
    expect(exp).toBeGreaterThan(iat);
    expect(exp - iat).toBeLessThanOrEqual(180 * 24 * 60 * 60);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  }

  it("signs a JWT Apple accepts as the client secret", () => {
    setSettings();
    checkSecret(clientSecret(CLIENT));
  });

  it("accepts the private key with its line breaks written as \\n", () => {
    setSettings({ APPLE_PRIVATE_KEY: privatePem.replace(/\r?\n/g, "\\n") });
    checkSecret(clientSecret(CLIENT));
  });

  it("answers null while a signing setting is missing", () => {
    setSettings({ APPLE_KEY_ID: "" });
    expect(clientSecret(CLIENT)).toBeNull();
  });

  it("answers null for a key that isn't a key, or isn't Apple's kind", () => {
    setSettings({ APPLE_PRIVATE_KEY: "not a key" });
    expect(clientSecret(CLIENT)).toBeNull();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    vi.stubEnv("APPLE_PRIVATE_KEY", rsa);
    expect(clientSecret(CLIENT)).toBeNull();
  });
});

describe("exchangeAppleCode", () => {
  it("swaps the code for Apple's refresh token and the Apple user it belongs to", async () => {
    setSettings();
    fetchMock.mockResolvedValue(swapped());
    expect(await exchangeAppleCode("the-code", CLIENT)).toEqual({
      refreshToken: "r-token",
      sub: APPLE_USER,
    });
    const { url, init, form } = sentForm(fetchMock);
    expect(url).toBe("https://appleid.apple.com/auth/token");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(form.get("client_id")).toBe(CLIENT);
    expect(form.get("client_secret")?.split(".")).toHaveLength(3);
    expect(form.get("code")).toBe("the-code");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers null when Apple refuses", async () => {
    setSettings();
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect(await exchangeAppleCode("the-code", CLIENT)).toBeNull();
  });

  it("answers null when the answer has no refresh token", async () => {
    setSettings();
    fetchMock.mockResolvedValue(new Response('{"access_token":"a"}', { status: 200 }));
    expect(await exchangeAppleCode("the-code", CLIENT)).toBeNull();
  });

  it("answers null when it can't tell whose code it was", async () => {
    setSettings();
    for (const answer of [
      { id_token: undefined },
      { id_token: "not-a-jwt" },
      { id_token: "a.%%%.c" },
      { id_token: idToken("just a string") },
      { id_token: idToken({ iss: "https://appleid.apple.com" }) },
      { id_token: idToken({ sub: "" }) },
      { id_token: idToken({ sub: 42 }) },
    ]) {
      fetchMock.mockResolvedValueOnce(swapped(answer));
      expect(await exchangeAppleCode("the-code", CLIENT)).toBeNull();
    }
  });

  it("answers null when Apple can't be reached", async () => {
    setSettings();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await exchangeAppleCode("the-code", CLIENT)).toBeNull();
  });

  it("logs Apple's error code but never the code, token or secret", async () => {
    setSettings();
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"invalid_grant","echo":"the-code"}', { status: 400 }),
    );
    await exchangeAppleCode("the-code", CLIENT);
    fetchMock.mockResolvedValueOnce(swapped({ id_token: idToken({ sub: 42, who: APPLE_USER }) }));
    await exchangeAppleCode("the-code", CLIENT);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await revokeAppleToken("r-token", CLIENT);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("invalid_grant");
    expect(logged).not.toContain("the-code");
    expect(logged).not.toContain("r-token");
    expect(logged).not.toContain(APPLE_USER);
    expect(logged).not.toContain("PRIVATE KEY");
    expect(logged).not.toMatch(/eyJ/);
  });

  it("answers null without asking Apple while settings are missing", async () => {
    setSettings({ APPLE_TEAM_ID: "" });
    expect(await exchangeAppleCode("the-code", CLIENT)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("jwtSubject", () => {
  it("reads the sub from a JWT's payload", () => {
    expect(jwtSubject(idToken({ sub: APPLE_USER, aud: "com.mulo.app" }))).toBe(APPLE_USER);
  });

  it("answers null for anything without a readable sub", () => {
    for (const token of [
      "",
      "not-a-jwt",
      "a.b",
      "a.b.c.d",
      "a.%%%.c",
      idToken(null),
      idToken(["sub"]),
      idToken({}),
      idToken({ sub: "" }),
      idToken({ sub: 7 }),
      idToken({ sub: "x".repeat(256) }),
    ]) {
      expect(jwtSubject(token)).toBeNull();
    }
  });
});

describe("revokeAppleToken", () => {
  it("asks Apple to revoke the refresh token", async () => {
    setSettings();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await revokeAppleToken("r-token", CLIENT)).toBe(true);
    const { url, init, form } = sentForm(fetchMock);
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    expect(init.method).toBe("POST");
    expect(form.get("client_id")).toBe(CLIENT);
    expect(form.get("client_secret")?.split(".")).toHaveLength(3);
    expect(form.get("token")).toBe("r-token");
    expect(form.get("token_type_hint")).toBe("refresh_token");
  });

  it("answers false when Apple refuses", async () => {
    setSettings();
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_client"}', { status: 400 }));
    expect(await revokeAppleToken("r-token", CLIENT)).toBe(false);
  });

  it("answers false when Apple can't be reached", async () => {
    setSettings();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await revokeAppleToken("r-token", CLIENT)).toBe(false);
  });

  it("answers false without asking Apple while settings are missing", async () => {
    setSettings({ APPLE_PRIVATE_KEY: "" });
    expect(await revokeAppleToken("r-token", CLIENT)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sealToken and openToken", () => {
  it("round-trip a token, without the token showing in the sealed value", () => {
    setSettings();
    const sealed = sealToken("r-token-secret");
    expect(sealed).not.toBeNull();
    expect(sealed).not.toContain("r-token-secret");
    expect(sealed?.split(".")).toHaveLength(3);
    expect(openToken(sealed ?? "")).toBe("r-token-secret");
  });

  it("seal the same token differently each time", () => {
    setSettings();
    expect(sealToken("same")).not.toBe(sealToken("same"));
  });

  it("refuse a tampered value", () => {
    setSettings();
    const [iv, tag, data] = (sealToken("r-token") ?? "").split(".") as [string, string, string];
    const flipped = Buffer.from(data, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(openToken(`${iv}.${tag}.${flipped.toString("base64url")}`)).toBeNull();
    expect(openToken("not.a.token")).toBeNull();
    expect(openToken("garbage")).toBeNull();
  });

  it("refuse a value sealed with another key", () => {
    setSettings();
    const sealed = sealToken("r-token") ?? "";
    vi.stubEnv("APPLE_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(openToken(sealed)).toBeNull();
  });

  it("answer null without a key, or with a key that isn't 32 bytes", () => {
    setSettings({ APPLE_TOKEN_KEY: "" });
    expect(hasTokenKey()).toBe(false);
    expect(sealToken("r-token")).toBeNull();
    expect(openToken("a.b.c")).toBeNull();
    vi.stubEnv("APPLE_TOKEN_KEY", randomBytes(16).toString("base64"));
    expect(hasTokenKey()).toBe(false);
    expect(sealToken("r-token")).toBeNull();
    vi.stubEnv("APPLE_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(hasTokenKey()).toBe(true);
  });
});
