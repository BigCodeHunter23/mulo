import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody } from "@/lib/app-route";
import { allowAddress, RateLimitedError } from "@/lib/rate-limit";
import { forgetDevice } from "@/lib/push/store";
import { expoPushToken } from "@/lib/validation";

const forgetBody = z.object({ token: expoPushToken });

/**
 * This phone stops getting pushes, whoever it was registered to. The app
 * sends it whenever an account leaves the phone (a log-out, an ended session,
 * a deleted account), so it needs no sign-in: by then there may be none.
 * Knowing a token only lets you stop pushes to that one phone, as
 * re-registering it already could. Always `{ ok: true }`, so the answer never
 * says whether the phone was registered.
 */
export const POST = appRoute(async (request: NextRequest) => {
  if (!(await allowAddress("pushForget"))) throw new RateLimitedError("pushForget");
  const body = await readBody(request, forgetBody);
  if (body instanceof Response) return body;

  await forgetDevice(body.token);
  return appJson<SaveResult>({ ok: true });
});
