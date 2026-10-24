import type { NextRequest } from "next/server";
import { z } from "zod";
import { setFollowing } from "@/app/u/[username]/actions";
import type { FollowResult } from "@/lib/app-api";
import { appJson, appRoute, readBody, signedInCaller, type Params } from "@/lib/app-route";

const followBody = z.object({
  following: z.boolean(),
  /** Only says which profile to refresh; `setFollowing` never trusts it for more. */
  username: z.string().max(40),
});

/** Follows or unfollows somebody, exactly as the button on their profile does. */
export const PUT = appRoute(
  async (request: NextRequest, { params }: Params<{ userId: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    const body = await readBody(request, followBody);
    if (body instanceof Response) return body;

    const { userId } = await params;
    return appJson<FollowResult>(await setFollowing(userId, body.username, body.following));
  },
);
