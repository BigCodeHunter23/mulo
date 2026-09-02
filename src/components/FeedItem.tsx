import Link from "next/link";
import type { FeedItem as Item } from "@/lib/feed";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];

  let value = seconds;
  let unit = "second";

  for (const [step, name] of units) {
    if (value < step) {
      unit = name;
      break;
    }
    value = Math.floor(value / step);
    unit = name;
  }

  if (unit === "second" && value < 30) return "just now";
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export default function FeedItem({
  item,
  showAuthor = true,
}: {
  item: Item;
  showAuthor?: boolean;
}) {
  return (
    <li className="flex gap-4 rounded border border-gray-200 p-4">
      <Link
        href={`/album/${item.release.mbid}`}
        className="h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100"
      >
        {item.release.cover_art_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.release.cover_art_url}
            alt={item.release.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        {showAuthor && (
          <p className="mb-1 text-sm text-gray-600">
            <Link
              href={`/u/${item.author.username}`}
              className="font-medium text-gray-900 hover:underline"
            >
              {item.author.display_name || item.author.username}
            </Link>{" "}
            rated
          </p>
        )}

        <div className="flex items-baseline gap-3">
          <Link
            href={`/album/${item.release.mbid}`}
            className="font-medium hover:underline"
          >
            {item.release.title}
          </Link>
          <span className="ml-auto shrink-0 font-semibold tabular-nums text-red-600">
            {item.score}/10
          </span>
        </div>

        {item.release.artist && (
          <Link
            href={`/artist/${item.release.artist.mbid}`}
            className="text-sm text-gray-600 hover:underline"
          >
            {item.release.artist.name}
          </Link>
        )}

        {item.review && (
          <p className="mt-2 text-sm text-gray-700">{item.review}</p>
        )}

        <p className="mt-2 text-xs text-gray-400">
          {timeAgo(item.created_at)}
        </p>
      </div>
    </li>
  );
}
