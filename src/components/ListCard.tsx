import Link from "next/link";
import type { ListSummary } from "@/lib/lists";
import { coverSrc } from "@/lib/cover-url";

/** A list at a glance: four covers in a square, its name, whose, and how long. */
export default function ListCard({ list, showOwner = true }: { list: ListSummary; showOwner?: boolean }) {
  const tiles = [0, 1, 2, 3].map((i) => list.covers[i] ?? null);

  return (
    <Link
      href={`/lists/${list.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong"
    >
      <span className="artwork grid h-20 w-20 shrink-0 grid-cols-2 overflow-hidden rounded-lg bg-surface-raised">
        {tiles.map((cover, i) =>
          cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={coverSrc(cover, 250) ?? cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span key={i} className="bg-surface-hover" />
          ),
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-text transition-colors group-hover:text-accent">
          {list.title}
        </span>
        <span className="mt-0.5 block truncate text-sm text-text-muted">
          {list.count} album{list.count === 1 ? "" : "s"}
          {list.ranked ? " · ranked" : ""}
          {showOwner ? ` · by ${list.owner.name}` : ""}
        </span>
        {list.description && (
          <span className="mt-1 line-clamp-1 block text-sm text-text-secondary">{list.description}</span>
        )}
      </span>
    </Link>
  );
}
