import type { Metadata } from "next";
import Link from "next/link";
import {
  CHART_GENRES,
  CHART_KINDS,
  getChart,
  getChartProgress,
  genreName,
  isChartKind,
  type ChartKind,
} from "@/lib/charts";
import ChartTable from "@/components/ChartTable";
import { ButtonLink, EmptyState } from "@/components/ui";

const HOW_MANY = 100;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; genre?: string }>;
}): Promise<Metadata> {
  const { type, genre } = await searchParams;
  const kind = type && isChartKind(type) ? type : "albums";
  const family = genreName(genre ?? null);
  const label = CHART_KINDS.find((k) => k.id === kind)!.label.toLowerCase();

  const title = family
    ? `Top ${HOW_MANY} ${family.toLowerCase()} ${label}`
    : `Top ${HOW_MANY} ${label}`;

  return {
    title,
    description: `The ${label} MULO rates highest${
      family ? ` in ${family.toLowerCase()}` : ""
    }, ranked by the whole community.`,
  };
}

function chartHref(kind: ChartKind, genre: string | null) {
  const search = new URLSearchParams({ type: kind });
  if (genre) search.set("genre", genre);
  return `/charts?${search}`;
}

const PILL =
  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";
const PILL_ON = "border-accent bg-accent-subtle text-accent";
const PILL_OFF =
  "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text";

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; genre?: string }>;
}) {
  const { type, genre: genreParam } = await searchParams;
  const kind: ChartKind = type && isChartKind(type) ? type : "albums";
  const genre =
    genreParam && CHART_GENRES.some((g) => g.id === genreParam) ? genreParam : null;

  const chart = await getChart(kind, { genre, limit: HOW_MANY });
  const progress = await getChartProgress(chart);

  const label = CHART_KINDS.find((k) => k.id === kind)!;
  const family = genreName(genre);
  const heading = family
    ? `Top ${family} ${label.label.toLowerCase()}`
    : `Top ${label.label.toLowerCase()}`;

  const percent =
    progress.total === 0 ? 0 : Math.round((progress.rated / progress.total) * 100);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          The Charts
        </p>
        <h1 className="display mt-2 text-4xl text-text sm:text-5xl">{heading}</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary sm:text-base">
          Ranked by everyone on MULO. A record climbs as more people back it, so
          three big scores never outrank a room full of them.
        </p>
      </header>

      {/* Albums / Songs / Artists */}
      <nav className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Chart type">
        {CHART_KINDS.map((option) => (
          <Link
            key={option.id}
            href={chartHref(option.id, genre)}
            aria-current={option.id === kind ? "page" : undefined}
            className={`${PILL} ${option.id === kind ? PILL_ON : PILL_OFF}`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {/* Everything, or one genre */}
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Genre">
        <Link
          href={chartHref(kind, null)}
          aria-current={genre === null ? "page" : undefined}
          className={`${PILL} ${genre === null ? PILL_ON : PILL_OFF}`}
        >
          All genres
        </Link>
        {CHART_GENRES.map((option) => (
          <Link
            key={option.id}
            href={chartHref(kind, option.id)}
            aria-current={option.id === genre ? "page" : undefined}
            className={`${PILL} ${option.id === genre ? PILL_ON : PILL_OFF}`}
          >
            {option.name}
          </Link>
        ))}
      </nav>

      {/* How much of this chart you've heard: the reason to scroll it */}
      {progress.rated > 0 && (
        <div className="mt-6 max-w-sm">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="display-sm text-text">
              You&rsquo;ve rated {progress.rated}{" "}
              <span className="text-text-muted">of these {progress.total}</span>
            </span>
            <span className="text-xs tabular-nums text-text-muted">{percent}%</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"
            role="img"
            aria-label={`You have rated ${progress.rated} of ${progress.total}`}
          >
            <div
              className="h-full rounded-full bg-score-you"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        {chart.entries.length === 0 ? (
          <EmptyState
            title="Nothing to rank yet"
            body={
              family
                ? `No ${family.toLowerCase()} ${label.label.toLowerCase()} have been rated on MULO yet. Rate a few and this chart fills itself.`
                : `No ${label.label.toLowerCase()} have been rated yet. Rate a few and this chart fills itself.`
            }
            action={
              <ButtonLink href="/discover">Find something to rate</ButtonLink>
            }
          />
        ) : (
          <>
            {/* Column labels earn their space from tablet width up; on a phone
                a gold star and a red number already say whose score is whose. */}
            <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-text-muted">
              <span>
                {chart.entries.length} of {chart.pool} rated
              </span>
              <span className="hidden shrink-0 items-center gap-5 sm:flex">
                <span className="w-12 text-right">Everyone</span>
                <span className="w-12 text-right">You</span>
              </span>
            </div>
            <ChartTable chart={chart} progress={progress} />
          </>
        )}
      </div>
    </main>
  );
}
