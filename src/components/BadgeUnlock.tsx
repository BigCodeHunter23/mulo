"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SOLO_BADGES, GENRE_FAMILIES, type Badge } from "@/lib/badge-catalog";
import BadgeIcon from "@/components/BadgeIcon";
import { Sparks } from "@/components/Celebrate";
import Portal from "@/components/Portal";
import ShareButton from "@/components/ShareButton";
import StoryButton from "@/components/StoryButton";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

/**
 * The moment a badge is earned.
 *
 * Collecting something should feel like collecting something. Every badge on
 * MULO is worked out from ratings rather than stored, which is what keeps them
 * honest, but it also means nothing ever announces itself — you would only
 * find out by going to look. This is the announcement: the whole screen dims,
 * the badge lands with its own glyph, sparks go, and the name and what it took
 * are finally said out loud.
 *
 * Earn several at once and they queue, one after another, because two at the
 * same time is worth less than two in a row.
 */

/** Everything there is, by slug, so a slug can be turned back into a badge. */
const BY_SLUG = new Map<string, Badge>([
  ...SOLO_BADGES.map((badge) => [badge.slug, badge] as const),
  ...GENRE_FAMILIES.flatMap((family) =>
    family.tiers.map(
      (tier) =>
        [
          tier.slug,
          {
            slug: tier.slug,
            name: tier.name,
            description: `Rated ${tier.need} ${family.name.toLowerCase()} albums`,
          },
        ] as const,
    ),
  ),
]);

const STORE = "mulo:badges";

/**
 * What the browser last saw this person holding. An empty store means we have
 * never looked here before — a new device, or cleared site data — so the
 * current list is written down quietly and nothing is celebrated. Somebody
 * opening MULO on a new phone should not be met with forty badges they earned
 * months ago.
 */
function readSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(slugs: string[]) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(slugs));
  } catch {
    // Private windows and blocked storage: no memory, so no celebration.
    // Never worth throwing over.
  }
}

/**
 * Work out which of the badges somebody now holds are new to this browser,
 * and remember the full list either way. Call it after any saved score.
 */
export function newlyEarned(slugs: string[] | undefined): Badge[] {
  if (!slugs) return [];

  const seen = readSeen();
  writeSeen(slugs);

  // First look on this device: take a note and say nothing.
  if (seen === null) return [];

  return slugs
    .filter((slug) => !seen.has(slug))
    .map((slug) => BY_SLUG.get(slug))
    .filter((badge): badge is Badge => Boolean(badge));
}

/** A milestone reached: the tenth album, the hundredth, and so on. */
type Milestone = { milestone: number; url: string };
type Moment = Badge | Milestone;

const MILESTONE_STORE = "mulo:milestones";

/**
 * Whether this browser has already celebrated a milestone. Removing a rating
 * and adding it back can land on the same count twice; once is enough.
 */
function firstTime(count: number): boolean {
  try {
    const raw = window.localStorage.getItem(MILESTONE_STORE);
    const seen = raw ? (JSON.parse(raw) as number[]) : [];
    if (seen.includes(count)) return false;
    window.localStorage.setItem(MILESTONE_STORE, JSON.stringify([...seen, count]));
  } catch {
    // No storage: celebrate anyway, the server only says so on a fresh rating.
  }
  return true;
}

/**
 * Everything a rating form needs to celebrate: hand it whatever `rate` gave
 * back, and drop `overlay` into the markup. Keeping the queue in one place
 * means each place people rate is a two-line change and they all behave the
 * same way.
 */
export function useBadgeUnlock() {
  const [queue, setQueue] = useState<Moment[]>([]);

  const celebrate = useCallback(
    (result: { ok: boolean; badges?: string[]; milestone?: { count: number; url: string } }) => {
      if (!result.ok) return;
      const fresh: Moment[] = newlyEarned(result.badges);
      // The milestone goes first: it's the bigger moment, and the one to share.
      if (result.milestone && firstTime(result.milestone.count)) {
        fresh.unshift({ milestone: result.milestone.count, url: result.milestone.url });
      }
      if (fresh.length > 0) setQueue((current) => [...current, ...fresh]);
    },
    [],
  );

  const overlay =
    queue.length > 0 ? (
      <BadgeUnlock badges={queue} onDone={() => setQueue([])} />
    ) : null;

  return { celebrate, overlay };
}

export default function BadgeUnlock({
  badges,
  onDone,
}: {
  /** The queue, shown one at a time. */
  badges: Moment[];
  onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  const badge = badges[at];

  // Each one lands with a buzz. It arrives after the save rather than on the
  // tap itself, so iPhones stay quiet here; Android feels it.
  useEffect(() => {
    haptic("celebrate");
  }, [at]);

  const next = useCallback(() => {
    if (at + 1 < badges.length) setAt(at + 1);
    else onDone();
  }, [at, badges.length, onDone]);

  // Escape or Enter closes, and the button takes focus on arrival, so a
  // keyboard never gets stuck behind the overlay.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  if (!badge) return null;

  if ("milestone" in badge) {
    return (
      <Portal>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="milestone-count"
          className="badge-unlock-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-bg/85 px-6 backdrop-blur-md"
          onClick={next}
        >
          <div
            className="relative flex w-full max-w-sm flex-col items-center text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="badge-unlock-label text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Milestone
            </p>
            <div className="relative mt-4 flex items-center justify-center">
              <Sparks count={24} reach={170} delay={0.5} />
              <h2
                id="milestone-count"
                className="badge-unlock-medal display text-8xl leading-none text-score-overall sm:text-9xl"
              >
                {badge.milestone}
              </h2>
            </div>
            <p className="badge-unlock-name display mt-4 text-3xl text-[#f3d98a]">albums rated</p>
            <p className="badge-unlock-copy mt-2 text-sm text-text-secondary">
              Your top-rated records are on a card, ready to share.
            </p>
            <div className="badge-unlock-copy mt-8 flex flex-wrap items-center justify-center gap-3">
              <ShareButton
                url={badge.url}
                title={`${badge.milestone} albums rated on MULO`}
                text={`${badge.milestone} albums rated on MULO.`}
              />
              <StoryButton src={`${badge.url}/story`} filename={`mulo-${badge.milestone}-albums`} />
              <Link href={badge.url} className={buttonClass({ variant: "secondary" })} onClick={onDone}>
                See the card
              </Link>
              <button type="button" autoFocus onClick={next} className={buttonClass({ variant: "ghost" })}>
                {at + 1 < badges.length ? "Next" : "Nice"}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-unlock-name"
        className="badge-unlock-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-bg/85 px-6 backdrop-blur-md"
        onClick={next}
      >
        <div
          className="relative flex w-full max-w-sm flex-col items-center text-center"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="badge-unlock-label text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Badge unlocked
          </p>

          {/* The medal itself: lands, then throws sparks */}
          <div className="relative mt-6 flex items-center justify-center">
            <Sparks count={20} reach={150} delay={0.5} />
            <span className="badge-unlock-ring absolute h-40 w-40 rounded-full border border-score-overall/40" />
            <span className="badge-unlock-medal relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-score-overall/60 bg-score-overall/15 text-score-overall shadow-[0_0_60px_-10px_rgba(245,197,24,0.8)]">
              <BadgeIcon slug={badge.slug} className="h-14 w-14" />
            </span>
          </div>

          <h2
            id="badge-unlock-name"
            className="badge-unlock-name display mt-8 text-4xl text-[#f3d98a] sm:text-5xl"
          >
            {badge.name}
          </h2>
          <p className="badge-unlock-copy mt-2 text-sm text-text-secondary">
            {badge.description}
          </p>

          {badges.length > 1 && (
            <p className="badge-unlock-copy mt-3 text-xs tabular-nums text-text-muted">
              {at + 1} of {badges.length}
            </p>
          )}

          <div className="badge-unlock-copy mt-8 flex flex-wrap items-center justify-center gap-3">
            <button type="button" autoFocus onClick={next} className={buttonClass()}>
              {at + 1 < badges.length ? "Next" : "Nice"}
            </button>
            <Link
              href="/badges"
              className={buttonClass({ variant: "secondary" })}
              onClick={onDone}
            >
              See the board
            </Link>
          </div>
        </div>
      </div>
    </Portal>
  );
}
