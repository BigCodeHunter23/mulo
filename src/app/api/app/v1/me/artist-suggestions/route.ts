import type { SuggestedArtists } from "@/lib/app-api";
import { appJson, appRoute, limitReads, signedInCaller } from "@/lib/app-route";
import { getArtistSuggestions } from "@/lib/artist-follows";

/** "Follow the artists you rate highest": up to 12, best first. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);
  return appJson<SuggestedArtists>({ artists: await getArtistSuggestions() });
});
