import type { NextRequest } from "next/server";
import type { ChartKind, ChartPage } from "@/lib/app-api";
import { appCaller, appJson, appRoute } from "@/lib/app-route";
import { CHART_GENRES, CHART_KINDS, getChart, getChartProgress, isChartKind } from "@/lib/charts";

/** The Charts page's hundred, as `charts/page.tsx` reads them. */
const HOW_MANY = 100;

/** The Charts (`charts/page.tsx`): one chart, and how much of it you've rated. */
export const GET = appRoute(async (request: NextRequest) => {
  const caller = await appCaller();
  if (caller instanceof Response) return caller;

  // Anything unknown falls back to the page's defaults, as its address does.
  const search = request.nextUrl.searchParams;
  const type = search.get("type");
  const kind: ChartKind = type && isChartKind(type) ? type : "albums";
  const asked = search.get("genre");
  const genre = asked && CHART_GENRES.some((g) => g.id === asked) ? asked : null;

  const chart = await getChart(kind, { genre, limit: HOW_MANY });
  const progress = await getChartProgress(chart);

  return appJson<ChartPage>({
    chart,
    progress: {
      yours: Object.fromEntries(progress.yours),
      rated: progress.rated,
      total: progress.total,
    },
    kinds: CHART_KINDS.map(({ id, label }) => ({ id, label })),
    genres: CHART_GENRES.map(({ id, name }) => ({ id, label: name })),
  });
});
