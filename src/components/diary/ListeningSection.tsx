import Link from "next/link";
import { coverSrc } from "@/lib/cover-url";
import { diaryHref } from "@/lib/diary-shared";
import { recentListening } from "@/lib/diary/read";
import CoverImage from "@/components/CoverImage";
import { SectionHeading } from "@/components/ui";
import { dayLabel } from "./dates";

/**
 * Listening, on a profile: the latest albums in their diary, for anyone the
 * diary lets see it. Nothing at all when there's nothing to show, a private
 * diary, or before migration 0025.
 */
export default async function ListeningSection({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const entries = (await recentListening(userId)).flatMap((entry) =>
    entry.release ? [{ ...entry, release: entry.release }] : [],
  );
  if (entries.length === 0) return null;

  return (
    <section className="mb-12">
      <SectionHeading
        action={
          <Link
            href={diaryHref(username)}
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            See the diary →
          </Link>
        }
      >
        Listening
      </SectionHeading>
      <ul className="rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-8 sm:overflow-visible sm:px-0">
        {entries.map(({ release, ...entry }) => {
          return (
            <li key={entry.id} className="w-24 shrink-0 sm:w-auto">
              <Link href={`/album/${release.mbid}`} className="group block">
                <span className="block aspect-square overflow-hidden rounded-md bg-surface-raised">
                  <CoverImage
                    src={coverSrc(release.cover, 250)}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </span>
                <span className="mt-1.5 block truncate text-xs font-medium text-text transition-colors group-hover:text-accent">
                  {release.title}
                </span>
                <time dateTime={entry.day} className="block truncate text-[11px] text-text-muted">
                  {dayLabel(entry.day)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
