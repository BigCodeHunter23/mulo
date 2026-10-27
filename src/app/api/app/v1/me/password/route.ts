import type { NextRequest } from "next/server";
import { z } from "zod";
import { changePasswordFor, setPasswordFor } from "@/lib/account";
import type { AccountResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";
import { getSessionFacts } from "@/lib/session-facts";

/** The shapes only; `changePasswordFor` and `setPasswordFor` check the values, as for the website. */
const changeBody = z.object({ current: z.string().max(200), next: z.string().max(200) });
const setBody = z.object({ next: z.string().max(200) });

/** A new password, once the current one checks out. The app stays logged in. */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, changeBody);
  if (body instanceof Response) return body;

  return appJson<AccountResult>(await changePasswordFor(user, body, await getSessionFacts()));
});

/**
 * A first password, for an account made with Apple or Google, so it can log
 * in with its email too. Needs a sign-in in the last few minutes.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, setBody);
  if (body instanceof Response) return body;

  return appJson<AccountResult>(await setPasswordFor(user, body, await getSessionFacts()));
});
