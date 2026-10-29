import type { NextRequest } from "next/server";
import { deleteReply } from "@/app/replies/actions";
import type { SaveResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  BAD_REQUEST,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { rowIdText } from "@/lib/validation";

/** Deletes a reply: your own, or any on your own review or take. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;

    const id = rowIdText.safeParse((await params).id);
    if (!id.success) return appError(400, BAD_REQUEST);

    return appJson<SaveResult>(await deleteReply(id.data));
  },
);
