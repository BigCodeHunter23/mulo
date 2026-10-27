import type { NextRequest } from "next/server";
import { z } from "zod";
import { changeEmailFor } from "@/lib/account";
import type { AccountResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `changeEmailFor` checks the values, as for the website. */
const emailBody = z.object({ email: z.string().max(400), current: z.string().max(200) });

/**
 * A new email address, once the password checks out. Nothing changes until
 * the link sent to the new address is followed.
 */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, emailBody);
  if (body instanceof Response) return body;

  return appJson<AccountResult>(await changeEmailFor(user, body));
});
