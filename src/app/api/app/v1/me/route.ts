import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteAccountFor } from "@/lib/account";
import type { Me, SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { getOwnProfile } from "@/lib/social";

/** The shape only; `deleteAccountFor` checks the password and the word. */
const deleteBody = z.object({ current: z.string().max(200), confirm: z.string().max(40) });

/** Who the app is signed in as, and whether they've finished signing up. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  return appJson<Me>({ ...user, profile: await getOwnProfile(user.id) });
});

/**
 * Deletes the caller's account and everything attached to it, once the
 * password checks out and DELETE is typed. The app forgets its session
 * afterwards; the token it holds no longer refreshes.
 */
export const DELETE = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, deleteBody);
  if (body instanceof Response) return body;

  const outcome = await deleteAccountFor(user, body);
  return appJson<SaveResult>(outcome.ok ? { ok: true } : outcome);
});
