import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteAccountFor } from "@/lib/account";
import type { DeleteResult, Me } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { getSessionFacts } from "@/lib/session-facts";
import { getOwnProfile } from "@/lib/social";

/**
 * The shape only; `deleteAccountFor` checks the word, and the password for an
 * account with one. An account without one sends none.
 */
const deleteBody = z.object({
  current: z.string().max(200).optional(),
  confirm: z.string().max(40),
});

/** Who the app is signed in as, and whether they've finished signing up. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const [profile, facts] = await Promise.all([getOwnProfile(user.id), getSessionFacts()]);
  return appJson<Me>({
    ...user,
    profile,
    signInMethods: facts.signInMethods,
    hasPassword: facts.hasPassword,
  });
});

/**
 * Deletes the caller's account and everything attached to it, once DELETE is
 * typed and it's them: the password checks out or, for an account without
 * one, they signed in just now. The app forgets its session afterwards; the
 * token it holds no longer refreshes.
 */
export const DELETE = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, deleteBody);
  if (body instanceof Response) return body;

  const outcome = await deleteAccountFor(user, body, await getSessionFacts());
  if (!outcome.ok) return appJson<DeleteResult>(outcome);
  return appJson<DeleteResult>(
    outcome.appleLinkLeft ? { ok: true, appleLinkLeft: true } : { ok: true },
  );
});
