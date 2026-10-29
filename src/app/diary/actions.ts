"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DiaryBatch, DiaryBatchResult, SaveResult } from "@/lib/app-api";
import { callbackOrigin, requireUser } from "@/lib/auth";
import { BATCH_MAX, IMPORT_SOURCES, type ImportSource } from "@/lib/diary-shared";
import {
  albumDaySchema,
  batchResult,
  deleteEntry,
  finishImport,
  fixAlbum,
  logListen,
  removeSource,
  saveAlbumDays,
  setDiaryPublic,
} from "@/lib/diary/entries";
import {
  approvalUrl,
  CONNECT_COOKIE,
  CONNECT_COOKIE_PATH,
  CONNECT_COOKIE_SECONDS,
  connectCookie,
  createConnectState,
  LASTFM_OFF,
  lastfmKeys,
  noteTimeZone,
} from "@/lib/diary/lastfm";
import { canonicalZone } from "@/lib/push/zones";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { rowIdSchema } from "@/lib/validation";

/**
 * The diary's website actions: connecting Last.fm, uploading a Spotify
 * history, and looking after your own entries. Each one acts only for whoever
 * is signed in, through the same lib the app API uses, and answers a failure
 * in words rather than throwing.
 */

const TRY_AGAIN = "Couldn't save that. Please try again.";
const SIGN_IN_FIRST = "Log in first.";
const DIARY_PAGE = "/u/[username]/diary";

/**
 * Connect Last.fm: off to Last.fm's approval page, coming back to this
 * website. `timeZone` is the browser's, which a new import reads days by. A
 * cookie ties the connect to this browser, so the callback only finishes it
 * here.
 */
export async function startLastfm(timeZone?: unknown): Promise<{ ok: false; error: string }> {
  const user = await requireUser("/diary/import");
  const keys = lastfmKeys();
  if (!keys) return { ok: false, error: LASTFM_OFF };
  let url: string;
  try {
    if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
    const zone = canonicalZone(timeZone);
    const state = await createConnectState(user.id, "web", zone);
    await noteTimeZone(user.id, zone);
    const origin = callbackOrigin();
    (await cookies()).set(CONNECT_COOKIE, connectCookie(state), {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "lax",
      path: CONNECT_COOKIE_PATH,
      maxAge: CONNECT_COOKIE_SECONDS,
    });
    url = approvalUrl(keys, `${origin}/diary/lastfm/callback?state=${state}`);
  } catch (error) {
    console.error("[diary] starting Last.fm failed:", error);
    return { ok: false, error: "Couldn't start connecting Last.fm. Please try again." };
  }
  redirect(url);
}

/** Never Last.fm: the website reads that itself, on the clock. */
const batch = z.object({
  source: z.enum(["spotify", "apple"]),
  days: z.array(albumDaySchema).max(BATCH_MAX),
  done: z.object({ total: z.number().int().min(0).max(1_000_000) }).optional(),
});

/** An upload's answer; `limited` when it hit the import limit, and can try again in a minute. */
export type UploadResult = DiaryBatchResult | { ok: false; error: string; limited: true };

/** One batch of a Spotify upload from the import page; the last says it's done. */
export async function uploadDiaryBatch(input: DiaryBatch): Promise<UploadResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: SIGN_IN_FIRST };
    if (!(await allowUser("import", user.id))) {
      return { ok: false, error: TOO_MANY, limited: true };
    }
    const parsed = batch.safeParse(input);
    if (!parsed.success) return { ok: false, error: TRY_AGAIN };
    const saved = await saveAlbumDays(user.id, parsed.data.source, parsed.data.days);
    if (saved.ok && parsed.data.done) {
      await finishImport(user.id, parsed.data.source, parsed.data.done.total);
    }
    return batchResult(saved);
  } catch (error) {
    console.error("[diary] upload failed:", error);
    return { ok: false, error: TRY_AGAIN };
  }
}

/** A change to your own diary: signed in, within the write limit, and never a throw. */
async function asYou(
  what: string,
  work: (userId: string) => Promise<SaveResult>,
  signedOut = SIGN_IN_FIRST,
): Promise<SaveResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: signedOut };
    if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
    const result = await work(user.id);
    revalidatePath(DIARY_PAGE, "page");
    return result;
  } catch (error) {
    console.error(`[diary] ${what} failed:`, error);
    return { ok: false, error: TRY_AGAIN };
  }
}

export async function deleteDiaryEntry(id: number): Promise<SaveResult> {
  if (!rowIdSchema.safeParse(id).success) return { ok: false, error: TRY_AGAIN };
  return asYou("deleting an entry", (userId) => deleteEntry(userId, id));
}

export async function removeDiarySource(source: string, keepEntries: boolean): Promise<SaveResult> {
  if (!(IMPORT_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: TRY_AGAIN };
  }
  return asYou("removing a source", (userId) =>
    removeSource(userId, source as ImportSource, keepEntries === true),
  );
}

export async function fixDiaryAlbum(entryId: number, mbid: string): Promise<SaveResult> {
  if (!rowIdSchema.safeParse(entryId).success) return { ok: false, error: TRY_AGAIN };
  return asYou("fixing an album", (userId) => fixAlbum(userId, entryId, mbid));
}

export async function setDiaryVisibility(value: boolean): Promise<SaveResult> {
  if (typeof value !== "boolean") return { ok: false, error: TRY_AGAIN };
  return asYou("showing the diary", (userId) => setDiaryPublic(userId, value));
}

const score = z.number().int().min(1).max(10).optional();

/**
 * Log a listen from an album page. A score is saved by the rating action,
 * which rates as whoever is signed in: the same person logged here.
 */
export async function logDiaryListen(
  mbid: string,
  day: string,
  value?: number,
): Promise<SaveResult> {
  if (!score.safeParse(value).success) return { ok: false, error: TRY_AGAIN };
  return asYou(
    "logging a listen",
    (userId) =>
      logListen(userId, {
        mbid: String(mbid),
        day: String(day),
        ...(value === undefined ? {} : { score: value }),
      }),
    "Log in to keep a diary.",
  );
}
