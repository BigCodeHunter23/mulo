import type { NextRequest } from "next/server";
import { deleteTake } from "@/app/versus/actions";
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

/** Deletes your own take, exactly as Delete under it does. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;

    const id = rowIdText.safeParse((await params).id);
    if (!id.success) return appError(400, BAD_REQUEST);

    return appJson<SaveResult>(await deleteTake(id.data));
  },
);
