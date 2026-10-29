import type { NextRequest } from "next/server";
import { z } from "zod";
import type { DiaryBatchResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { BATCH_MAX } from "@/lib/diary-shared";
import { albumDaySchema, finishImport, saveAlbumDays } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

/** Never Last.fm: the website reads that itself, on the clock. */
const batch = z.object({
  source: z.enum(["spotify", "apple"]),
  days: z.array(albumDaySchema).max(BATCH_MAX),
  /** The albums the phone counted as added, for the bell line and the push. */
  done: z.object({ total: z.number().int().min(0).max(1_000_000) }).optional(),
});

/**
 * Album-days worked out on the phone from a Spotify file or the Apple Music
 * library, up to 500 at a time. The last batch says it's done, for the bell.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("import", user.id))) throw new RateLimitedError("import");
  const body = await readBody(request, batch);
  if (body instanceof Response) return body;

  const saved = await saveAlbumDays(user.id, body.source, body.days);
  if (saved.ok && body.done) await finishImport(user.id, body.source, body.done.total);
  return appJson<DiaryBatchResult>(saved);
});
