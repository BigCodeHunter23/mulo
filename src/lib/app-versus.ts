import "server-only";
import type { VersusTakes } from "@/lib/app-api";
import { getMatchupForDay, getVersusView, shiftDay } from "@/lib/versus";
import { getTakes } from "@/lib/versus-takes";
import type { VersusView } from "@/lib/versus-shared";

/** No takes section at all, for a day with no matchup. */
export const NO_TAKES: VersusTakes = { available: false, count: 0, takes: [] };

/**
 * A matchup's takes as its viewer may see them: like the split, they stay
 * hidden until the viewer picks or the matchup closes (`versus/Takes.tsx`).
 * The count shows either way.
 */
export async function visibleTakes(view: VersusView): Promise<VersusTakes> {
  const { available, takes } = await getTakes(view.matchup.id);
  const open = view.closed || view.mine !== null;
  return { available, count: takes.length, takes: open ? takes : [] };
}

/**
 * Yesterday's result under today's matchup (`Yesterday` in
 * `versus/VersusScreen.tsx`), if it had one and anybody picked.
 */
export async function yesterdayView(today: string): Promise<VersusView | null> {
  const matchup = await getMatchupForDay(shiftDay(today, -1));
  if (!matchup) return null;
  const view = await getVersusView(matchup);
  return view.tally && view.tally.left + view.tally.right > 0 ? view : null;
}
