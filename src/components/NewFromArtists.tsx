import Link from "next/link";
import CoverImage from "@/components/CoverImage";
import { SectionHeading } from "@/components/ui";
import { coverSrc } from "@/lib/cover-url";
import { getNewReleases } from "@/lib/releases/shelf";
import { KIND_LABEL } from "@/lib/releases/words";

/**
 * "New from artists you follow": the last four weeks, newest first, then
 * what's coming in the month ahead, dimmed. Nothing to show hides it.
 */
export default async function NewFromArtists({ userId }: { userId: string }) {
  const releases = await getNewReleases(userId);
  if (releases.length === 0) return null;

  return (
    <section>
      <SectionHeading>New from artists you follow</SectionHeading>
      <ul className="rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {releases.map((release, i) => (
          <li key={release.mbid} className={`w-36 shrink-0 ${release.soon ? "opacity-60" : ""}`}>
            <Link href={`/album/${release.mbid}`} className="group flex flex-col gap-1.5">
              <div className="artwork mb-1 aspect-square w-full overflow-hidden rounded-lg">
                <CoverImage
                  src={coverSrc(release.cover_art_url, 250)}
                  alt={`${release.title} by ${release.artist.name}`}
                  eager={i < 4}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
              </div>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  release.soon ? "text-text-muted" : "text-accent"
                }`}
              >
                {release.when}
              </span>
              <span className="line-clamp-2 text-sm font-medium text-text transition-colors group-hover:text-accent">
                {release.title}
              </span>
              <span className="truncate text-xs text-text-muted">
                {release.artist.name} · {KIND_LABEL[release.kind]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
