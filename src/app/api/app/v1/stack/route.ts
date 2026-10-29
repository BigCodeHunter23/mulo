import type { NextRequest } from "next/server";
import type { StackRun } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { GENRE_FAMILIES } from "@/lib/badge-catalog";
import {
  getListeningStack,
  getStack,
  listeningWaiting,
  STACK_DECADES,
  STACK_RUN,
} from "@/lib/stack";

/**
 * The Stack (`stack/page.tsx`): a fresh run of records to rate, picked for
 * the signed-in person, never anything they've already scored. A new run is
 * drawn on every call, so nothing may cache it (`appJson` sees to that).
 * `from=listening` draws From your listening instead: the albums in their
 * diary they haven't rated, with no filters.
 */
export const GET = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  // Anything unknown is no filter at all, as on the page.
  const search = request.nextUrl.searchParams;
  const asked = Number(search.get("decade"));
  const decade = STACK_DECADES.includes(asked) ? asked : null;
  const family = search.get("genre");
  const genre = family && GENRE_FAMILIES.some((f) => f.id === family) ? family : null;

  const fromListening = search.get("from") === "listening";
  const [albums, listening] = await Promise.all([
    fromListening ? getListeningStack(STACK_RUN) : getStack(user.id, STACK_RUN, { decade, genre }),
    listeningWaiting(),
  ]);

  return appJson<StackRun>({
    albums,
    decade: fromListening ? null : decade,
    genre: fromListening ? null : genre,
    decades: [...STACK_DECADES],
    genres: GENRE_FAMILIES.map(({ id, name }) => ({ id, label: name })),
    from: fromListening ? "listening" : null,
    listening,
  });
});
