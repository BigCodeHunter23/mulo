import Link from "next/link";
import type { DiaryEntry } from "@/lib/app-api";
import { coverSrc } from "@/lib/cover-url";
import CoverImage from "@/components/CoverImage";
import EntryMenu from "./EntryMenu";
import { dayLabel } from "./dates";

/** A plain square with the album's first letter, for one not matched to an album yet. */
function Blank({ album }: { album: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-surface-raised text-lg font-semibold uppercase text-text-muted"
    >
      {Array.from(album.trim())[0] ?? "?"}
    </span>
  );
}

/**
 * One album on one day: the cover, the album and artist (linked once it's
 * matched to an album), the day, the owner's score in red, and for the owner
 * the menu to fix or delete it.
 */
export default function DiaryEntryRow({ entry, own }: { entry: DiaryEntry; own: boolean }) {
  const title = entry.release?.title ?? entry.album;
  const artist = entry.release?.artist ?? entry.artist;
  const href = entry.release ? `/album/${entry.release.mbid}` : null;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-raised">
        <CoverImage
          src={coverSrc(entry.release?.cover, 250)}
          alt=""
          className="h-full w-full object-cover"
          fallback={<Blank album={title} />}
        />
      </span>

      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate text-sm font-medium text-text transition-colors hover:text-accent"
          >
            {title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-text">{title}</p>
        )}
        <p className="truncate text-xs text-text-muted">
          {artist}
          <span aria-hidden="true"> · </span>
          <time dateTime={entry.day}>{dayLabel(entry.day)}</time>
        </p>
      </div>

      {entry.score !== null && (
        <span
          className="display-sm shrink-0 tabular-nums text-score-you"
          aria-label={`Scored ${entry.score} out of 10`}
        >
          {entry.score}
          <span className="text-xs text-text-muted">/10</span>
        </span>
      )}

      {own && <EntryMenu id={entry.id} matching={entry.matching} title={title} />}
    </li>
  );
}
