import type { NextRequest } from "next/server";
import { z } from "zod";
import { changePasswordFor } from "@/lib/account";
import type { AccountResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `changePasswordFor` checks the values, as for the website. */
const passwordBody = z.object({ current: z.string().max(200), next: z.string().max(200) });

/** A new password, once the current one checks out. The app stays logged in. */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, passwordBody);
  if (body instanceof Response) return body;

  return appJson<AccountResult>(await changePasswordFor(user, body));
});
