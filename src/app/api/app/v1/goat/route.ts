import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveTopPicks } from "@/app/goat/actions";
import type { GoatPage, SaveResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  BAD_REQUEST,
  limitReads,
  readBody,
  signedInCaller,
} from "@/lib/app-route";
import { getPickSuggestions, getTopPicks } from "@/lib/top-picks";

const kindSchema = z.enum(["artist", "album"]);

/** Your GOAT list and what the builder suggests adding (`goat/page.tsx`). */
export const GET = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const kind = kindSchema
    .default("artist")
    .safeParse(request.nextUrl.searchParams.get("kind") ?? undefined);
  if (!kind.success) return appError(400, BAD_REQUEST);

  const [picks, suggestions] = await Promise.all([
    getTopPicks(user.id, kind.data),
    getPickSuggestions(user.id, kind.data),
  ]);
  return appJson<GoatPage>({ kind: kind.data, picks, suggestions });
});

/** The same limit as the action, which keeps the first ten real ids. */
const saveBody = z.object({ kind: kindSchema, mbids: z.array(z.string().max(64)).max(50) });

/** Saves the whole ranked list, as the builder does after every change. */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, saveBody);
  if (body instanceof Response) return body;

  return appJson<SaveResult>(await saveTopPicks(body.kind, body.mbids));
});
