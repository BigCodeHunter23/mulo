import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getOwnRatings } from "@/lib/ratings";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

const SORTS = [
  { key: "recent", label: "Recent" },
  { key: "highest", label: "Highest" },
  { key: "lowest", label: "Lowest" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default async function MyRatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const active: SortKey = SORTS.some((s) => s.key === sort)
    ? (sort as SortKey)
    : "recent";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ratings = await getOwnRatings(active);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading
        action={
          ratings.length > 0 ? (
            <div className="flex gap-1">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={`/ratings?sort=${s.key}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active === s.key
                      ? "bg-surface-raised text-text"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      >
        My ratings
        {ratings.length > 0 && (
          <span className="ml-2 text-sm font-normal text-text-muted">
            {ratings.length}
          </span>
        )}
      </SectionHeading>

      {ratings.length === 0 ? (
        <EmptyState
          title="Nothing rated yet"
          body="Find an album and give it a score out of 10."
          action={<ButtonLink href="/search">Search music</ButtonLink>}
        />
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2">
          {ratings.map((rating) => (
            <li
              key={rating.release.mbid}
              className="group flex gap-4 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
            >
              <Link
                href={`/album/${rating.release.mbid}`}
                className="artwork h-20 w-20 shrink-0 overflow-hidden rounded-lg transition-transform group-hover:scale-[1.02]"
              >
                {rating.release.cover_art_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rating.release.cover_art_url}
                    alt={rating.release.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <Link
                    href={`/album/${rating.release.mbid}`}
                    className="display-sm min-w-0 flex-1 truncate text-sm text-text transition-colors hover:text-accent"
                  >
                    {rating.release.title}
                  </Link>
                  <span className="display-sm shrink-0 tabular-nums text-score-you">
                    {rating.score}
                    <span className="text-[10px] text-text-muted">/10</span>
                  </span>
                </div>

                {rating.release.artist && (
                  <Link
                    href={`/artist/${rating.release.artist.mbid}`}
                    className="block truncate text-sm text-text-secondary transition-colors hover:text-text"
                  >
                    {rating.release.artist.name}
                  </Link>
                )}

                {rating.review && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-text-muted">
                    {rating.review}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
