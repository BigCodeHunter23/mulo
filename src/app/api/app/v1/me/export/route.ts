import { NextResponse } from "next/server";
import { appRoute, signedInCaller } from "@/lib/app-route";
import { exportFor, exportHeaders } from "@/lib/export";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

/**
 * A copy of everything the caller has put into MULO, the same file the
 * account page's "Download my data" saves. Limited like a change, since it
 * reads a lot.
 */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");

  const { body, filename } = await exportFor(user);
  return new NextResponse(body, { headers: exportHeaders(filename) });
});
