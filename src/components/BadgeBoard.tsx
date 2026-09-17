import type { BadgeBoard, BoardBadge, BoardLadder } from "@/lib/badges";
import BadgeIcon from "@/components/BadgeIcon";
import { SectionHeading } from "@/components/ui";

/**
 * The badge itself: its own glyph in a gold ring once earned, the same glyph
 * dimmed behind a dashed ring while it isn't. Showing the locked shape is the
 * point — a board of outlines waiting to be filled in reads as a collection,
 * where a grid of question marks read as a wall. What it took to earn stays
 * hidden either way, which was always the part worth keeping back.
 */
function Medal({ earned, slug }: { earned: boolean; slug: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
        earned
          ? "border-score-overall/50 bg-score-overall/15 text-score-overall"
          : "border-dashed border-border bg-surface-raised/50 text-text-muted/70"
      }`}
    >
      <BadgeIcon slug={slug} className="h-5 w-5" />
    </span>
  );
}

function Tile({ badge }: { badge: BoardBadge }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        badge.earned
          ? "border-score-overall/30 bg-score-overall/[0.07]"
          : "border-border bg-surface/40"
      }`}
    >
      <Medal earned={badge.earned} slug={badge.slug} />
      <span className="min-w-0">
        <span
          className={`display-sm block text-sm ${
            badge.earned ? "text-[#f3d98a]" : "text-text-secondary"
          }`}
        >
          {badge.name}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-text-muted">
          {badge.description ?? "Locked"}
        </span>
      </span>
    </li>
  );
}

function Ladder({ ladder }: { ladder: BoardLadder }) {
  return (
    <li className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <Medal earned={ladder.tiers.some((tier) => tier.earned)} slug={ladder.id} />
          <span className="display-sm text-sm text-text">{ladder.name}</span>
        </span>
        <span className="text-xs tabular-nums text-text-muted">
          {ladder.rated} rated
        </span>
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {ladder.tiers.map((tier) => (
          <li
            key={tier.slug}
            className={`rounded-lg border px-2 py-1.5 text-center text-[11px] font-medium leading-tight ${
              tier.earned
                ? "border-score-overall/30 bg-score-overall/10 text-[#f3d98a]"
                : "border-dashed border-border text-text-muted"
            }`}
          >
            {tier.name}
          </li>
        ))}
      </ol>
    </li>
  );
}

/**
 * Everything there is to collect. Earned badges say how they were earned;
 * locked ones show their name and nothing else, because working out what
 * Box Set takes is half the fun.
 */
export default function BadgeBoardView({
  board,
  heading,
  intro,
}: {
  board: BadgeBoard;
  heading: string;
  intro: string;
}) {
  const percent = Math.round((board.earned / board.total) * 100);

  return (
    <>
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Badges
        </p>
        <h1 className="display mt-2 text-4xl text-text sm:text-5xl">{heading}</h1>
        <p className="mt-2 text-sm text-text-secondary sm:text-base">{intro}</p>

        <div className="mt-5 max-w-sm">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="display-sm text-text">
              {board.earned}{" "}
              <span className="text-text-muted">of {board.total} collected</span>
            </span>
            <span className="text-xs tabular-nums text-text-muted">{percent}%</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"
            role="img"
            aria-label={`${board.earned} of ${board.total} badges collected`}
          >
            <div
              className="h-full rounded-full bg-score-overall"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-12">
        {board.groups.map((group) => (
          <section key={group.id}>
            <SectionHeading
              action={
                <span className="text-xs tabular-nums text-text-muted">
                  {group.badges.filter((badge) => badge.earned).length}/
                  {group.badges.length}
                </span>
              }
            >
              {group.title}
            </SectionHeading>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.badges.map((badge) => (
                <Tile key={badge.slug} badge={badge} />
              ))}
            </ul>
          </section>
        ))}

        <section>
          <SectionHeading
            action={
              <span className="text-xs text-text-muted">Rated albums, by genre</span>
            }
          >
            Genres
          </SectionHeading>
          <ul className="grid gap-3 lg:grid-cols-2">
            {board.ladders.map((ladder) => (
              <Ladder key={ladder.id} ladder={ladder} />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
