import type { Badge } from "@/lib/badges";
import { Star } from "@/components/StarScore";

/** Earned badges on a profile. Hover or focus shows how each was earned. */
export default function Badges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <li
          key={badge.slug}
          title={badge.description}
          className="flex items-center gap-1.5 rounded-full border border-score-overall/30 bg-score-overall/10 px-3 py-1 text-xs font-medium text-[#f3d98a]"
        >
          <Star className="h-3 w-3 text-score-overall" />
          {badge.name}
          <span className="sr-only">: {badge.description}</span>
        </li>
      ))}
    </ul>
  );
}
