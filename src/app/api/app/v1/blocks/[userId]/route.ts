import type { NextRequest } from "next/server";
import { z } from "zod";
import { setBlocked } from "@/app/u/[username]/actions";
import type { FollowResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller, type Params } from "@/lib/app-route";

const blockBody = z.object({
  blocked: z.boolean(),
  /** Only says which profile to refresh; `setBlocked` never trusts it for more. */
  username: z.string().max(40),
});

/**
 * Blocks or unblocks somebody, exactly as the button on their profile does:
 * blocking ends follows both ways.
 */
export const PUT = appRoute(
  async (request: NextRequest, { params }: Params<{ userId: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    const body = await readBody(request, blockBody);
    if (body instanceof Response) return body;

    const { userId } = await params;
    return appJson<FollowResult>(await setBlocked(userId, body.username, body.blocked));
  },
);
