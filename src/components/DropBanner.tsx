import Link from "next/link";
import { currentDrop } from "@/lib/drop";
import { getCachedRelease } from "@/lib/catalog";
import { coverSrc } from "@/lib/cover-url";
import RecordDisc from "@/components/RecordDisc";

/** This week's Drop, as a way in from the home and Discover pages. */
export default async function DropBanner() {
  const drop = currentDrop();
  const release = await getCachedRelease(drop.album.mbid);
  const cover = coverSrc(release?.cover_art_url ?? null, 250);

  return (
    <Link
      href="/drop"
      className="drop-banner group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/[0.14] via-surface to-surface p-4 transition-colors hover:border-accent/60 sm:p-5"
    >
      <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
        <div className="absolute inset-0 translate-x-[28%] transition-transform duration-500 group-hover:translate-x-[40%]">
          <RecordDisc cover={release?.cover_art_url ?? null} className="h-full w-full" spinning />
        </div>
        <div className="artwork relative h-full w-full overflow-hidden rounded-md shadow-xl">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 pl-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
          The Drop &middot; Week {drop.week}
        </p>
        <p className="display-sm mt-1 truncate text-lg text-text sm:text-xl">{drop.album.title}</p>
        <p className="truncate text-sm text-text-secondary">{drop.album.artist}</p>
        <p className="mt-1.5 text-xs text-text-muted">Everybody&rsquo;s rating it this week</p>
      </div>
      <span className="hidden shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg transition-transform group-active:scale-95 sm:inline">
        Rate it &rarr;
      </span>
    </Link>
  );
}
