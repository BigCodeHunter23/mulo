import type { NextRequest } from "next/server";
import { z } from "zod";
import type { NotificationSettings, SaveResult } from "@/lib/app-api";
import { appJson, appRoute, limitReads, readBody, signedInCaller } from "@/lib/app-route";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";
import { readSettings, saveSettings } from "@/lib/push/store";

const change = z
  .object({
    follows: z.boolean(),
    loves: z.boolean(),
    replies: z.boolean(),
    versus: z.boolean(),
    drop: z.boolean(),
    streak: z.boolean(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);

/** Which pushes you get. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);
  return appJson<NotificationSettings>(await readSettings(user.id));
});

/** Turns some on or off; the bell shows everything either way. */
export const PATCH = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const body = await readBody(request, change);
  if (body instanceof Response) return body;

  await saveSettings(user.id, body);
  return appJson<SaveResult>({ ok: true });
});
