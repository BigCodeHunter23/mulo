import type { NextRequest } from "next/server";
import { backNomination } from "@/app/versus/actions";
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

/** Backs a nomination, or takes the backing back, as its ▲ button does. */
function backing(back: boolean) {
  return appRoute(async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;

    const id = rowIdText.safeParse((await params).id);
    if (!id.success) return appError(400, BAD_REQUEST);

    return appJson<SaveResult>(await backNomination(id.data, back));
  });
}

export const PUT = backing(true);
export const DELETE = backing(false);
