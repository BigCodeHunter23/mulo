import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";
import { registerDevice, removeDevice, touchClock } from "@/lib/push/store";
import { canonicalZone } from "@/lib/push/zones";
import { expoPushToken } from "@/lib/validation";

const registerBody = z.object({
  token: expoPushToken,
  platform: z.enum(["ios", "android"]),
  timeZone: z.string().max(64).nullable(),
});

const removeBody = z.object({ token: expoPushToken });

/**
 * This phone takes pushes for whoever's signed in, from now on. Sent on every
 * launch, which also notes the visit and the phone's time zone.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const body = await readBody(request, registerBody);
  if (body instanceof Response) return body;

  await registerDevice(user.id, body.token, body.platform);
  await touchClock(user.id, canonicalZone(body.timeZone));
  return appJson<SaveResult>({ ok: true });
});

/** Signing out on this phone: it stops getting this account's pushes. */
export const DELETE = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const body = await readBody(request, removeBody);
  if (body instanceof Response) return body;

  await removeDevice(user.id, body.token);
  return appJson<SaveResult>({ ok: true });
});
