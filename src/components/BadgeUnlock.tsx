"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SOLO_BADGES, GENRE_FAMILIES, type Badge } from "@/lib/badge-catalog";
import BadgeIcon from "@/components/BadgeIcon";
import { Sparks } from "@/components/Celebrate";
import Portal from "@/components/Portal";
import { buttonClass } from "@/components/ui";

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

/**
 * Everything a rating form needs to celebrate: hand it whatever `rate` gave
 * back, and drop `overlay` into the markup. Keeping the queue in one place
 * means each place people rate is a two-line change and they all behave the
 * same way.
 */
export function useBadgeUnlock() {
  const [queue, setQueue] = useState<Badge[]>([]);

  const celebrate = useCallback((result: { ok: boolean; badges?: string[] }) => {
    if (!result.ok) return;
    const fresh = newlyEarned(result.badges);
    if (fresh.length > 0) setQueue((current) => [...current, ...fresh]);
  }, []);

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
  badges: Badge[];
  onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  const badge = badges[at];

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
