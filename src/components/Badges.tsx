import Link from "next/link";
import type { Badge } from "@/lib/badge-catalog";
import BadgeIcon from "@/components/BadgeIcon";

/** Past this many the row turns into a wall, so the rest live on the board. */
const SHOWN = 8;

/**
 * Earned badges on a profile, with a way through to the whole board. Hover or
 * focus shows how each one was earned.
 */
export default function Badges({ badges, href }: { badges: Badge[]; href: string }) {
  const shown = badges.slice(0, SHOWN);
  const rest = badges.length - shown.length;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {shown.map((badge) => (
        <li
          key={badge.slug}
          title={badge.description}
          className="flex items-center gap-1.5 rounded-full border border-score-overall/30 bg-score-overall/10 px-3 py-1 text-xs font-medium text-[#f3d98a]"
        >
          <BadgeIcon slug={badge.slug} className="h-3.5 w-3.5 text-score-overall" />
          {badge.name}
          <span className="sr-only">: {badge.description}</span>
        </li>
      ))}
      <li>
        <Link
          href={href}
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text"
        >
          {rest > 0
            ? `${rest} more`
            : badges.length === 0
              ? "Badges to collect"
              : "All badges"}
          <span aria-hidden="true">→</span>
        </Link>
      </li>
    </ul>
  );
}
