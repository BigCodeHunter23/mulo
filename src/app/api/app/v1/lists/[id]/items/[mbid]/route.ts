import type { NextRequest } from "next/server";
import { z } from "zod";
import { addToList, moveInList, removeFromList, setListNote } from "@/app/lists/actions";
import type { ListResult } from "@/lib/app-api";
import {
  appError,
  appJson,
  appRoute,
  readBody,
  signedInCaller,
  type Params,
} from "@/lib/app-route";
import { LIST_NOT_FOUND, listId } from "@/lib/app-profile";

type Item = Params<{ id: string; mbid: string }>;

/** A change to one album on a list: a new place (1 is the top) or a new note. */
const itemChange = z.union([
  z.object({ to: z.number().int() }).strict(),
  z.object({ note: z.string().max(2000) }).strict(),
]);

/**
 * The list and album from the address. The actions check the album id and
 * that the list is the caller's own, in the website's words.
 */
async function where({ params }: Item) {
  const { id, mbid } = await params;
  return { id: listId(id), mbid };
}

/** Adds an album to the end of a list. */
export const PUT = appRoute(async (_request: NextRequest, item: Item) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const { id, mbid } = await where(item);
  if (id === null) return appError(404, LIST_NOT_FOUND);

  return appJson<ListResult>(await addToList(id, mbid));
});

/** Moves an album, or changes its note. */
export const PATCH = appRoute(async (request: NextRequest, item: Item) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const { id, mbid } = await where(item);
  if (id === null) return appError(404, LIST_NOT_FOUND);
  const body = await readBody(request, itemChange);
  if (body instanceof Response) return body;

  return appJson<ListResult>(
    "to" in body ? await moveInList(id, mbid, body.to) : await setListNote(id, mbid, body.note),
  );
});

/** Takes an album off a list. */
export const DELETE = appRoute(async (_request: NextRequest, item: Item) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const { id, mbid } = await where(item);
  if (id === null) return appError(404, LIST_NOT_FOUND);

  return appJson<ListResult>(await removeFromList(id, mbid));
});
