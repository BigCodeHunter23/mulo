import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnRatings } from "@/lib/ratings";
import { Score } from "@/components/StarScore";
import SectionHeading from "@/components/SectionHeading";

const SORTS = [
  { key: "recent", label: "Most recent" },
  { key: "highest", label: "Highest rated" },
  { key: "lowest", label: "Lowest rated" },
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const ratings = await getOwnRatings(active);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <SectionHeading
        action={
          ratings.length > 0 ? (
            <div className="flex gap-1.5 text-sm">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={`/ratings?sort=${s.key}`}
                  className={`rounded border px-2.5 py-1 ${
                    active === s.key
                      ? "border-mulo-navy bg-mulo-navy text-white"
                      : "border-gray-300 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      >
        My Ratings
      </SectionHeading>

      <p className="mb-6 text-sm text-mulo-muted">
        {ratings.length === 0
          ? "Nothing rated yet."
          : `${ratings.length} title${ratings.length === 1 ? "" : "s"}`}
      </p>

      {ratings.length === 0 ? (
        <div className="rounded border border-gray-200 p-8 text-center">
          <p className="mb-4 text-mulo-muted">
            Find an album and give it a score out of 10.
          </p>
          <Link
            href="/search"
            className="inline-block rounded bg-mulo-orange px-4 py-2 font-medium text-white hover:bg-mulo-orange-dark"
          >
            Search music
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col">
          {ratings.map((rating, index) => (
            <li
              key={rating.release.mbid}
              className="mulo-rule flex gap-4 py-5 first:border-t-2 first:border-t-mulo-rule first:pt-5"
            >
              <span className="w-5 shrink-0 pt-1 text-right font-display text-lg text-mulo-muted tabular-nums">
                {index + 1}
              </span>

              <Link
                href={`/album/${rating.release.mbid}`}
                className="h-28 w-28 shrink-0 overflow-hidden bg-gray-100"
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
                <Link
                  href={`/album/${rating.release.mbid}`}
                  className="font-display text-xl font-semibold text-mulo-navy hover:underline"
                >
                  {rating.release.title}
                  {rating.release.release_date && (
                    <span className="ml-1.5 font-normal text-mulo-muted">
                      ({rating.release.release_date.slice(0, 4)})
                    </span>
                  )}
                </Link>

                {rating.release.artist && (
                  <Link
                    href={`/artist/${rating.release.artist.mbid}`}
                    className="block text-sm text-mulo-orange hover:underline"
                  >
                    {rating.release.artist.name}
                  </Link>
                )}

                {rating.review && (
                  <p className="mt-2 text-sm text-gray-700">{rating.review}</p>
                )}

                <p className="mt-2 text-xs text-mulo-muted">
                  Rated on{" "}
                  {new Date(rating.created_at).toLocaleDateString("en-GB")}
                </p>
              </div>

              <div className="shrink-0 pt-1">
                <Score kind="you" value={rating.score} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
