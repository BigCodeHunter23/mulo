import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnRatings } from "@/lib/ratings";

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">My ratings</h1>
      <p className="mb-6 text-sm text-gray-500">
        {ratings.length === 0
          ? "Nothing rated yet."
          : `${ratings.length} album${ratings.length === 1 ? "" : "s"} rated.`}
      </p>

      {ratings.length > 0 && (
        <div className="mb-6 flex gap-2 text-sm">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`/ratings?sort=${s.key}`}
              className={`rounded border px-3 py-1.5 ${
                active === s.key
                  ? "border-black bg-black text-white"
                  : "border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}

      {ratings.length === 0 ? (
        <div className="rounded border border-gray-200 p-6 text-center">
          <p className="mb-3 text-gray-600">
            Find an album and give it a score out of 10.
          </p>
          <Link
            href="/search"
            className="inline-block rounded bg-black px-4 py-2 text-white"
          >
            Search music
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {ratings.map((rating) => (
            <li
              key={rating.release.mbid}
              className="flex gap-4 rounded border border-gray-200 p-4"
            >
              <Link
                href={`/album/${rating.release.mbid}`}
                className="h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100"
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
                <div className="flex items-baseline gap-3">
                  <Link
                    href={`/album/${rating.release.mbid}`}
                    className="font-medium hover:underline"
                  >
                    {rating.release.title}
                  </Link>
                  <span className="ml-auto shrink-0 font-semibold tabular-nums text-red-600">
                    {rating.score}/10
                  </span>
                </div>

                {rating.release.artist && (
                  <Link
                    href={`/artist/${rating.release.artist.mbid}`}
                    className="text-sm text-gray-600 hover:underline"
                  >
                    {rating.release.artist.name}
                  </Link>
                )}

                {rating.review && (
                  <p className="mt-2 text-sm text-gray-700">{rating.review}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
