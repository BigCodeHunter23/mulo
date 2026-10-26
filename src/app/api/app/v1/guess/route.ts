import type { GuessGame } from "@/lib/app-api";
import { appCaller, appJson, appRoute, limitReads } from "@/lib/app-route";
import { getGuessGame } from "@/lib/guess";

/** Records in a game, as `guess/page.tsx` plays. */
const GAME_ROUNDS = 10;

/**
 * Guess the score (`guess/page.tsx`): a fresh draw of records with everyone's
 * score on each. Every call is a new game, so nothing may cache it (`appJson`
 * sees to that).
 */
export const GET = appRoute(async () => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;
  await limitReads(caller.user);

  return appJson<GuessGame>({ albums: await getGuessGame(GAME_ROUNDS) });
});
