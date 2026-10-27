import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteList, updateList } from "@/app/lists/actions";
import type { ListPage, ListResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  limitReads,
  readBody,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { LIST_NOT_FOUND, listId } from "@/lib/app-profile";
import { isHidden } from "@/lib/blocks";
import { getList, LIST_LIMIT } from "@/lib/lists";

/** The shape only; `updateList` checks and trims the values, as for the website. */
const listDetails = z.object({
  title: z.string().max(400),
  description: z.string().max(2000).optional(),
  ranked: z.boolean(),
});

/**
 * One list with all its albums, and whether it's the caller's to change. A
 * list by somebody blocked, either way round, isn't there. For people with an
 * account, as the page is.
 */
export const GET = appRoute(async (_request: NextRequest, { params }: Params<{ id: string }>) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const id = listId((await params).id);
  const list = id === null ? null : await getList(id);
  if (!list || (await isHidden(list.ownerId))) return appError(404, LIST_NOT_FOUND);

  return appJson<ListPage>({ list, isOwner: list.ownerId === user.id, limit: LIST_LIMIT });
});

/** New details for a list: its name, what it's about, and whether it's ranked. */
export const PATCH = appRoute(async (request: NextRequest, { params }: Params<{ id: string }>) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const id = listId((await params).id);
  if (id === null) return appError(404, LIST_NOT_FOUND);
  const body = await readBody(request, listDetails);
  if (body instanceof Response) return body;

  return appJson<ListResult>(await updateList(id, body));
});

/** Deletes a list; its albums go with it. */
export const DELETE = appRoute(
  async (_request: NextRequest, { params }: Params<{ id: string }>) => {
    const user = await signedInCaller();
    if (user instanceof Response) return user;
    const id = listId((await params).id);
    if (id === null) return appError(404, LIST_NOT_FOUND);

    return appJson<ListResult>(await deleteList(id));
  },
);
