import type { NextRequest } from "next/server";
import { deleteTake } from "@/app/versus/actions";
import type { SaveResult } from "@/lib/app-api";
import { appJson, appRoute, signedInCaller, type Params } from "@/lib/app-route";

/** Deletes your own take, exactly as Delete under it does. `deleteTake` checks the id. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;

    return appJson<SaveResult>(await deleteTake(Number((await params).id)));
  },
);
