import type { NextRequest } from "next/server";
import type { SaveResult } from "@/lib/app-api";
import { appError, appJson, appRoute, signedInCaller, type Params } from "@/lib/app-route";
import { IMPORT_SOURCES, type ImportSource } from "@/lib/diary-shared";
import { removeSource } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";

const isImportSource = (source: string): source is ImportSource =>
  (IMPORT_SOURCES as readonly string[]).includes(source);

/**
 * Removes everything one source sent and forgets it (for Last.fm, that
 * disconnects it). `?entries=keep` only forgets the source.
 */
export const DELETE = appRoute(
  async (request: NextRequest, { params }: Params<{ source: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
    const { source } = await params;
    if (!isImportSource(source)) return appError(404, "No such source.");
    const keep = request.nextUrl.searchParams.get("entries") === "keep";
    return appJson<SaveResult>(await removeSource(user.id, source, keep));
  },
);
