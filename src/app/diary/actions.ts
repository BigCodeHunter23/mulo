"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DiaryBatch, DiaryBatchResult, SaveResult } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { BATCH_MAX, IMPORT_SOURCES, type ImportSource } from "@/lib/diary-shared";
import {
  albumDaySchema,
  deleteEntry,
  finishImport,
  fixAlbum,
  logListen,
  removeSource,
  saveAlbumDays,
  setDiaryPublic,
} from "@/lib/diary/entries";
import { approvalUrl, createConnectState, LASTFM_OFF, lastfmKeys } from "@/lib/diary/lastfm";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { rowIdSchema } from "@/lib/validation";

/**
 * The diary's website actions: connecting Last.fm, uploading a Spotify
 * history, and looking after your own entries. Each one acts only for whoever
 * is signed in, through the same lib the app API uses.
 */

const TRY_AGAIN = "Couldn't save that. Please try again.";
const SIGN_IN_FIRST = "Log in first.";
const DIARY_PAGE = "/u/[username]/diary";

/** An address on this computer or its network, which a development server answers over http. */
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/;

/**
 * This website's own address, for Last.fm to come back to. A forged host
 * would only send the person who forged it somewhere else.
 */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "getmulo.com";
  const protocol = h.get("x-forwarded-proto") ?? (LOCAL_HOST.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Connect Last.fm: off to Last.fm's approval page. */
export async function startLastfm(): Promise<{ error: string }> {
  const user = await requireUser("/diary/import");
  const keys = lastfmKeys();
  if (!keys) return { error: LASTFM_OFF };
  if (!(await allowUser("write", user.id))) return { error: TOO_MANY };
  const state = await createConnectState(user.id, "web");
  redirect(approvalUrl(keys, `${await origin()}/diary/lastfm/callback?state=${state}`));
}

/** Never Last.fm: the website reads that itself, on the clock. */
const batch = z.object({
  source: z.enum(["spotify", "apple"]),
  days: z.array(albumDaySchema).max(BATCH_MAX),
  done: z.object({ total: z.number().int().min(0).max(1_000_000) }).optional(),
});

/** One batch of a Spotify upload from the import page; the last says it's done. */
export async function uploadDiaryBatch(input: DiaryBatch): Promise<DiaryBatchResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: SIGN_IN_FIRST };
    if (!(await allowUser("import", user.id))) return { ok: false, error: TOO_MANY };
    const parsed = batch.safeParse(input);
    if (!parsed.success) return { ok: false, error: TRY_AGAIN };
    const saved = await saveAlbumDays(user.id, parsed.data.source, parsed.data.days);
    if (saved.ok && parsed.data.done) {
      await finishImport(user.id, parsed.data.source, parsed.data.done.total);
    }
    return saved;
  } catch (error) {
    console.error("[diary] upload failed:", error);
    return { ok: false, error: TRY_AGAIN };
  }
}

/** A change to your own diary: signed in, and within the write limit. */
async function asYou(work: (userId: string) => Promise<SaveResult>): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGN_IN_FIRST };
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
  return work(user.id);
}

export async function deleteDiaryEntry(id: number): Promise<SaveResult> {
  if (!rowIdSchema.safeParse(id).success) return { ok: false, error: TRY_AGAIN };
  const result = await asYou((userId) => deleteEntry(userId, id));
  revalidatePath(DIARY_PAGE, "page");
  return result;
}

export async function removeDiarySource(source: string, keepEntries: boolean): Promise<SaveResult> {
  if (!(IMPORT_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: TRY_AGAIN };
  }
  const result = await asYou((userId) =>
    removeSource(userId, source as ImportSource, keepEntries === true),
  );
  revalidatePath(DIARY_PAGE, "page");
  return result;
}

export async function fixDiaryAlbum(entryId: number, mbid: string): Promise<SaveResult> {
  if (!rowIdSchema.safeParse(entryId).success) return { ok: false, error: TRY_AGAIN };
  const result = await asYou((userId) => fixAlbum(userId, entryId, mbid));
  revalidatePath(DIARY_PAGE, "page");
  return result;
}

export async function setDiaryVisibility(value: boolean): Promise<SaveResult> {
  if (typeof value !== "boolean") return { ok: false, error: TRY_AGAIN };
  const result = await asYou((userId) => setDiaryPublic(userId, value));
  revalidatePath(DIARY_PAGE, "page");
  return result;
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
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to keep a diary." };
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };
  const result = await logListen(user.id, {
    mbid: String(mbid),
    day: String(day),
    ...(value === undefined ? {} : { score: value }),
  });
  revalidatePath(DIARY_PAGE, "page");
  return result;
}
