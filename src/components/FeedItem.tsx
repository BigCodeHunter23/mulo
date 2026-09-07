import Link from "next/link";
import Avatar from "@/components/Avatar";
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
  return `${value}${unit.charAt(0)}`;
}

export default function FeedItem({
  item,
  showAuthor = true,
}: {
  item: Item;
  showAuthor?: boolean;
}) {
  return (
    <li className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      {showAuthor && (
        <div className="mb-3.5 flex items-center gap-2.5">
          <Avatar
            url={item.author.avatar_url}
            name={item.author.display_name || item.author.username}
            size="sm"
          />
          <Link
            href={`/u/${item.author.username}`}
            className="text-sm font-medium text-text transition-colors hover:text-accent"
          >
            {item.author.display_name || item.author.username}
          </Link>
          <span className="text-xs text-text-muted">
            rated · {timeAgo(item.created_at)}
          </span>
        </div>
      )}

      <div className="flex gap-4">
        <Link
          href={`/album/${item.release.mbid}`}
          className="artwork h-20 w-20 shrink-0 overflow-hidden rounded-lg transition-transform group-hover:scale-[1.02]"
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
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/album/${item.release.mbid}`}
                className="display-sm block truncate text-base text-text transition-colors hover:text-accent"
              >
                {item.release.title}
              </Link>
              {item.release.artist && (
                <Link
                  href={`/artist/${item.release.artist.mbid}`}
                  className="block truncate text-sm text-text-secondary transition-colors hover:text-text"
                >
                  {item.release.artist.name}
                </Link>
              )}
            </div>

            <span className="display-sm shrink-0 text-lg tabular-nums text-score-you">
              {item.score}
              <span className="text-xs text-text-muted">/10</span>
            </span>
          </div>

          {item.review && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-secondary">
              {item.review}
            </p>
          )}

          {!showAuthor && (
            <p className="mt-2 text-xs text-text-muted">
              {timeAgo(item.created_at)} ago
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
