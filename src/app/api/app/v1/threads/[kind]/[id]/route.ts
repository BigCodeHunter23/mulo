import type { NextRequest } from "next/server";
import { z } from "zod";
import type { ThreadPage } from "@/lib/app-api";
import { appCaller, appError, appJson, appRoute, limitReads, type Params } from "@/lib/app-route";
import { getThread } from "@/lib/replies";
import { rowIdText } from "@/lib/validation";

const kindSchema = z.enum(["album", "artist", "take"]);
const NOT_FOUND = "We couldn't find that.";

/**
 * A review or take with its replies, as its thread page shows it. A review
 * that's gone answers `{ state: "gone" }` rather than 404, so the app can
 * tell it from a website without replies.
 */
export const GET = appRoute(
  async (_request: NextRequest, { params }: Params<{ kind: string; id: string }>) => {
    const caller = await appCaller();
    if (caller instanceof Response) return caller;
    await limitReads(caller.user);

    const { kind, id } = await params;
    const parsedKind = kindSchema.safeParse(kind);
    const parsedId = rowIdText.safeParse(id);
    if (!parsedKind.success || !parsedId.success) return appError(404, NOT_FOUND);

    return appJson<ThreadPage>(await getThread(parsedKind.data, parsedId.data));
  },
);
