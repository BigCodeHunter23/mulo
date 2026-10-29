import type { NextRequest } from "next/server";
import type { StackRun } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { GENRE_FAMILIES } from "@/lib/badge-catalog";
import { getStack, STACK_DECADES, STACK_RUN } from "@/lib/stack";

/**
 * The Stack (`stack/page.tsx`): a fresh run of records to rate, picked for
 * the signed-in person, never anything they've already scored. A new run is
 * drawn on every call, so nothing may cache it (`appJson` sees to that).
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

  const albums = await getStack(user.id, STACK_RUN, { decade, genre });

  return appJson<StackRun>({
    albums,
    decade,
    genre,
    decades: [...STACK_DECADES],
    genres: GENRE_FAMILIES.map(({ id, name }) => ({ id, label: name })),
    // From your listening isn't drawn yet: every run is the usual one.
    from: null,
    listening: 0,
  });
});
