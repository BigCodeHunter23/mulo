import { z } from "zod";

/**
 * Schemas for everything that arrives from outside: form fields, action
 * arguments, route and query parameters. Shared by server and client code,
 * so it has no server-only imports.
 *
 * Messages are the ones people see, so they stay plain (docs/voice.md).
 */

/** UUID-shaped hex, as MusicBrainz issues ids. Case doesn't matter to Postgres. */
export const MBID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An artist, album or song id from MusicBrainz. */
export const mbidSchema = z.string().regex(MBID_PATTERN);

/** A person's id: Supabase user ids are UUIDs too. */
export const userIdSchema = z.string().regex(MBID_PATTERN);

/** A database row id (lists, ratings, reports, matchups…). */
export const rowIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** A row id that arrived as text, from a form field or the address bar. */
export const rowIdText = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number)
  .pipe(rowIdSchema);

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    USERNAME_PATTERN,
    "Usernames must be 3–20 characters, using only letters, numbers and underscores.",
  );

const pageSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,4}$/)
  .transform(Number);

/** A page number from the address bar ("?page=2"), counted from 1. Anything else is page 1. */
export function pageNumber(value: string | undefined): number {
  const parsed = pageSchema.safeParse(value);
  return parsed.success ? parsed.data : 1;
}

/** "2026-10", the month a Mixtape covers. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That doesn't look like a valid email address.")
  .pipe(z.email("That doesn't look like a valid email address."));

/** Supabase hashes with bcrypt, which only reads the first 72 bytes. */
const PASSWORD_MAX = 72;

/** A password being chosen: signing up, or setting a new one. */
export const newPasswordSchema = z
  .string()
  .min(6, "Your password needs to be at least 6 characters.")
  .max(PASSWORD_MAX, `Your password can be at most ${PASSWORD_MAX} characters.`);

/** A password being typed in to log in: only its presence is ours to check. */
export const passwordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX, "That email and password combination doesn't match an account.");

/** Free text from a form, trimmed, with an upper limit the database also holds. */
export function textSchema(max: number, message = `Keep it to ${max} characters.`) {
  return z.string().trim().max(max, message);
}

/** A form field as a string: missing or a file both read as empty. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The first problem with some input, worded for people. */
export function firstError(error: z.ZodError, fallback = "Please check that and try again."): string {
  return error.issues[0]?.message || fallback;
}
