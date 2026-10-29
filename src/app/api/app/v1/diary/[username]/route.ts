import type { NextRequest } from "next/server";
import type { DiaryPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { PERSON_NOT_FOUND } from "@/lib/app-profile";
import { getDiaryPage } from "@/lib/diary/read";

/**
 * A page of somebody's diary, newest first; `before` is the last page's
 * `next`. Kept to themselves, it says so; hidden either way, nobody's there.
 */
export const GET = appRoute(
  async (request: NextRequest, { params }: Params<{ username: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);
    const { username } = await params;
    const page = await getDiaryPage(username, request.nextUrl.searchParams.get("before"));
    if (!page) return appError(404, PERSON_NOT_FOUND);
    return appJson<DiaryPage>(page);
  },
);
