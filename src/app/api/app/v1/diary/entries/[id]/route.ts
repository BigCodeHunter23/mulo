import type { NextRequest } from "next/server";
import type { SaveResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  BAD_REQUEST,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { deleteEntry } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";
import { rowIdText } from "@/lib/validation";

/** Deletes one entry of your own. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
    const id = rowIdText.safeParse((await params).id);
    if (!id.success) return appError(400, BAD_REQUEST);
    return appJson<SaveResult>(await deleteEntry(user.id, id.data));
  },
);
