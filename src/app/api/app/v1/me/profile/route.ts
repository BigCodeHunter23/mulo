import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveProfile } from "@/app/profile/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `saveProfile` checks the values, as it does for the website. */
const profileBody = z.object({
  username: z.string().max(40),
  display_name: z.string().max(100).optional(),
});

/**
 * The first welcome step: a username, and a display name if they like. The
 * website's own action does the checking and saving. The bio and the photo
 * aren't sent, so it leaves them alone, and with no `next` it doesn't redirect.
 */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, profileBody);
  if (body instanceof Response) return body;

  const form = new FormData();
  form.set("username", body.username);
  form.set("display_name", body.display_name ?? "");
  const result = await saveProfile({}, form);
  return appJson<SaveResult>(result.error ? { ok: false, error: result.error } : { ok: true });
});
