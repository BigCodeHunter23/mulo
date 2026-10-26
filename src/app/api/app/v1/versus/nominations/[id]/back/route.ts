import type { NextRequest } from "next/server";
import { backNomination } from "@/app/versus/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, signedInCaller, type Params } from "@/lib/app-route";

/** Backs a nomination, or takes the backing back, as its ▲ button does. `backNomination` checks the id. */
function backing(back: boolean) {
  return appRoute(async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;

    return appJson<SaveResult>(await backNomination(Number((await params).id), back));
  });
}

export const PUT = backing(true);
export const DELETE = backing(false);
