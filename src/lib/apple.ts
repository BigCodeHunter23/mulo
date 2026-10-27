import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";

/**
 * Talking to Apple about Sign in with Apple: swapping the one-time code the
 * iPhone's Apple sheet gives for Apple's refresh token, and revoking that
 * token when the account is deleted, as Apple requires. Also the sealing of
 * those tokens before they're stored.
 *
 * Every setting here is optional. While one is missing, signing in with Apple
 * still works; these steps are skipped and say so in the logs.
 *
 * Never log a token, a code, the private key or the client secret.
 */

const APPLE = "https://appleid.apple.com";
const TIMEOUT_MS = 10_000;
/**
 * How long a client secret lasts. Apple allows up to six months, but a fresh
 * one is signed for every call, so a short life costs nothing and means a
 * leaked one is soon useless.
 */
const SECRET_LIFETIME_SECONDS = 60 * 60;

type SigningSettings = { teamId: string; keyId: string; privateKey: string };

/**
 * The settings needed to sign a client secret, or null while any is missing.
 * The .p8 key may be pasted with its line breaks written as `\n`, as some
 * hosts' settings fields keep it on one line.
 */
function appleSettings(): SigningSettings | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!teamId || !keyId || !privateKey) {
    console.warn(
      "[apple] APPLE_TEAM_ID, APPLE_KEY_ID or APPLE_PRIVATE_KEY isn't set; skipping Apple's tokens.",
    );
    return null;
  }
  return { teamId, keyId, privateKey };
}

/** Apple's keys are P-256 (ES256); anything else would sign a secret Apple refuses. */
function signingKey(pem: string): KeyObject | null {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      console.error("[apple] APPLE_PRIVATE_KEY isn't a P-256 key.");
      return null;
    }
    return key;
  } catch {
    console.error("[apple] APPLE_PRIVATE_KEY couldn't be read as a private key.");
    return null;
  }
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * The client secret Apple asks for: an ES256 JWT signed with the .p8 key, for
 * one client (the app's bundle id or the website's Services ID). Null while
 * the settings are missing or the key can't be used.
 */
export function clientSecret(clientId: string): string | null {
  const settings = appleSettings();
  if (!settings) return null;
  const key = signingKey(settings.privateKey);
  if (!key) return null;

  const iat = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "ES256", kid: settings.keyId });
  const payload = base64url({
    iss: settings.teamId,
    iat,
    exp: iat + SECRET_LIFETIME_SECONDS,
    aud: APPLE,
    sub: clientId,
  });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

/** A form POST to one of Apple's auth endpoints; null if Apple can't be reached. */
async function postToApple(
  endpoint: "token" | "revoke",
  form: Record<string, string>,
): Promise<Response | null> {
  try {
    return await fetch(`${APPLE}/auth/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      `[apple] couldn't reach Apple's ${endpoint} endpoint:`,
      error instanceof Error ? error.name : "unknown error",
    );
    return null;
  }
}

/** Apple's error code (`invalid_grant`, …), which is safe to log; never the body itself. */
async function appleError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = z.object({ error: z.string().max(100) }).safeParse(body);
  return parsed.success ? parsed.data.error : "no error code";
}

const TokenAnswer = z.object({
  refresh_token: z.string().min(1).max(2000),
  id_token: z.string().min(1).max(4000),
});

const Subject = z.object({ sub: z.string().min(1).max(255) });

/**
 * The `sub` (for Apple, the Apple user's id) in a JWT's payload, or null if
 * it can't be read. The signature is NOT checked, so only use this on a token
 * that has already been trusted: one straight from Apple over TLS, or one
 * Supabase has just accepted.
 */
export function jwtSubject(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const parsed = Subject.safeParse(payload);
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
}

/** What a code swap gives: Apple's refresh token, and the Apple user it belongs to. */
export type AppleGrant = { refreshToken: string; sub: string };

/**
 * Swaps the one-time authorization code from Apple's sign-in sheet for
 * Apple's refresh token, with the Apple user it was issued for (the `sub` of
 * the id_token Apple answers with, read without checking its signature since
 * it came straight from Apple over TLS). `clientId` is the client the code
 * was issued to. Null on any failure, or when Apple's answer doesn't say
 * whose code it was.
 */
export async function exchangeAppleCode(
  code: string,
  clientId: string,
): Promise<AppleGrant | null> {
  const secret = clientSecret(clientId);
  if (!secret) return null;
  const response = await postToApple("token", {
    client_id: clientId,
    client_secret: secret,
    code,
    grant_type: "authorization_code",
  });
  if (!response) return null;
  if (!response.ok) {
    console.error(
      `[apple] code exchange refused (${response.status}):`,
      await appleError(response),
    );
    return null;
  }
  const parsed = TokenAnswer.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    console.error("[apple] code exchange answered without a refresh token or identity token.");
    return null;
  }
  const sub = jwtSubject(parsed.data.id_token);
  if (!sub) {
    console.error("[apple] code exchange's identity token couldn't be read.");
    return null;
  }
  return { refreshToken: parsed.data.refresh_token, sub };
}

/**
 * Asks Apple to revoke a refresh token, which ends that account's Sign in
 * with Apple link. True once Apple has accepted it.
 */
export async function revokeAppleToken(refreshToken: string, clientId: string): Promise<boolean> {
  const secret = clientSecret(clientId);
  if (!secret) return false;
  const response = await postToApple("revoke", {
    client_id: clientId,
    client_secret: secret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  if (!response) return false;
  if (!response.ok) {
    console.error(`[apple] revoke refused (${response.status}):`, await appleError(response));
    return false;
  }
  return true;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The key tokens are sealed with: APPLE_TOKEN_KEY, 32 bytes in base64. */
function tokenKey(): Buffer | null {
  const raw = process.env.APPLE_TOKEN_KEY?.trim();
  if (!raw) {
    console.warn("[apple] APPLE_TOKEN_KEY isn't set; Apple's tokens can't be kept.");
    return null;
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    console.error("[apple] APPLE_TOKEN_KEY must be 32 bytes, written in base64.");
    return null;
  }
  return key;
}

/** Whether APPLE_TOKEN_KEY is set and usable, so tokens can be sealed and opened. */
export function hasTokenKey(): boolean {
  return tokenKey() !== null;
}

/**
 * Seals a token for storage with AES-256-GCM under APPLE_TOKEN_KEY, as
 * `iv.tag.ciphertext` in base64url. Null without a usable key.
 */
export function sealToken(token: string): string | null {
  const key = tokenKey();
  if (!key) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

/**
 * Opens a value from `sealToken`. Null if it was changed, sealed under
 * another key, or there's no key.
 */
export function openToken(sealed: string): string | null {
  const key = tokenKey();
  if (!key) return null;
  const parts = sealed.split(".");
  if (parts.length !== 3) return null;
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data || iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
