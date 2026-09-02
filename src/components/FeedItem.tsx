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
    <li className="flex gap-4 border-b border-gray-200 py-5">
      <Link
        href={`/album/${item.release.mbid}`}
        className="h-24 w-24 shrink-0 overflow-hidden bg-gray-100"
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
          <p className="mb-1 text-sm text-mulo-muted">
            <Link
              href={`/u/${item.author.username}`}
              className="font-display text-base font-medium text-mulo-navy hover:underline"
            >
              {item.author.display_name || item.author.username}
            </Link>{" "}
            rated
          </p>
        )}

        <div className="flex items-baseline gap-3">
          <Link
            href={`/album/${item.release.mbid}`}
            className="font-display text-lg font-semibold text-mulo-navy hover:underline"
          >
            {item.release.title}
          </Link>
          <span className="ml-auto shrink-0 font-display text-lg font-semibold tabular-nums text-score-you">
            {item.score}
            <span className="text-xs text-mulo-muted">/10</span>
          </span>
        </div>

        {item.release.artist && (
          <Link
            href={`/artist/${item.release.artist.mbid}`}
            className="text-sm text-mulo-orange hover:underline"
          >
            {item.release.artist.name}
          </Link>
        )}

        {item.review && (
          <p className="mt-2 text-sm text-gray-700">{item.review}</p>
        )}

        <p className="mt-2 text-xs text-mulo-muted">
          {timeAgo(item.created_at)}
        </p>
      </div>
    </li>
  );
}
