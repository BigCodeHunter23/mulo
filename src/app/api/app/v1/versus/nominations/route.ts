import type { NextRequest } from "next/server";
import { z } from "zod";
import { nominateMatchup } from "@/app/versus/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller } from "@/lib/app-route";

/** The shape only; `nominateMatchup` checks both are artists' ids. */
const nominationBody = z.object({ left: z.string(), right: z.string() });

/** Puts two artists forward, exactly as Nominate on the Versus page does. */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, nominationBody);
  if (body instanceof Response) return body;

  return appJson<SaveResult>(await nominateMatchup(body.left, body.right));
});
