import Link from "next/link";
import Avatar from "@/components/Avatar";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import type { FeedItem as Item } from "@/lib/feed";

type Of<K extends Item["kind"]> = Extract<Item, { kind: K }>;

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

const EYEBROW =
  "text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted";
const TITLE =
  "display-sm block truncate text-base text-text transition-colors hover:text-accent";
const SUBTITLE =
  "block truncate text-sm text-text-secondary transition-colors hover:text-text";

function AuthorScore({ score }: { score: number }) {
  return (
    <span className="display-sm shrink-0 text-lg tabular-nums text-score-you">
      {score}
      <span className="text-xs text-text-muted">/10</span>
    </span>
  );
}

function Artwork({
  href,
  src,
  name,
  round = false,
}: {
  href: string;
  src: string | null;
  name: string;
  round?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`artwork h-20 w-20 shrink-0 overflow-hidden transition-transform group-hover:scale-[1.02] ${
        round ? "rounded-full" : "rounded-lg"
      }`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          loading="lazy"
          className={`h-full w-full object-cover ${round ? "object-top" : ""}`}
        />
      ) : (
        round && (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-muted">
            {name.charAt(0).toUpperCase()}
          </span>
        )
      )}
    </Link>
  );
}

function Review({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-secondary">
      {text}
    </p>
  );
}

function AlbumDetails({ item }: { item: Of<"album"> }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>Album</p>
          <Link href={`/album/${item.release.mbid}`} className={TITLE}>
            {item.release.title}
          </Link>
          {item.release.artist && (
            <Link href={`/artist/${item.release.artist.mbid}`} className={SUBTITLE}>
              {item.release.artist.name}
            </Link>
          )}
        </div>
        <AuthorScore score={item.score} />
      </div>
      <Review text={item.review} />
    </>
  );
}

function ArtistDetails({ item }: { item: Of<"artist"> }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>Artist</p>
          <Link href={`/artist/${item.artist.mbid}`} className={TITLE}>
            {item.artist.name}
          </Link>
        </div>
        <AuthorScore score={item.score} />
      </div>
      <Review text={item.review} />
    </>
  );
}

function SongDetails({ item }: { item: Of<"songs"> }) {
  const { release, songs } = item;

  if (songs.length === 1) {
    return (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>Song</p>
          <Link href={`/album/${release.mbid}`} className={TITLE}>
            {songs[0].title}
          </Link>
          <p className="truncate text-sm text-text-secondary">
            {release.title}
            {release.artist && ` · ${release.artist.name}`}
          </p>
        </div>
        <AuthorScore score={songs[0].score} />
      </div>
    );
  }

  const best = [...songs].sort((a, b) => b.score - a.score).slice(0, 3);
  const more = songs.length - best.length;

  return (
    <>
      <p className={EYEBROW}>{songs.length} songs from</p>
      <Link href={`/album/${release.mbid}`} className={TITLE}>
        {release.title}
      </Link>
      {release.artist && (
        <Link href={`/artist/${release.artist.mbid}`} className={SUBTITLE}>
          {release.artist.name}
        </Link>
      )}
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {best.map((song, i) => (
          <li
            key={i}
            className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-0.5 text-xs"
          >
            <span className="min-w-0 truncate text-text-secondary">{song.title}</span>
            <span className="font-bold tabular-nums text-score-you">{song.score}</span>
          </li>
        ))}
        {more > 0 && (
          <li className="px-1 py-0.5 text-xs text-text-muted">+{more} more</li>
        )}
      </ul>
    </>
  );
}

export default function FeedItem({
  item,
  showAuthor = true,
}: {
  item: Item;
  showAuthor?: boolean;
}) {
  const ago = timeAgo(item.created_at);

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
          <span className="text-xs text-text-muted">rated · {ago}</span>
        </div>
      )}

      <div className="flex gap-4">
        {item.kind === "artist" ? (
          <Artwork
            href={`/artist/${item.artist.mbid}`}
            src={artistPhotoSrc(item.artist.image_url, 300)}
            name={item.artist.name}
            round
          />
        ) : (
          <Artwork
            href={`/album/${item.release.mbid}`}
            src={coverSrc(item.release.cover_art_url, 250)}
            name={item.release.title}
          />
        )}

        <div className="min-w-0 flex-1">
          {item.kind === "album" && <AlbumDetails item={item} />}
          {item.kind === "artist" && <ArtistDetails item={item} />}
          {item.kind === "songs" && <SongDetails item={item} />}

          {!showAuthor && (
            <p className="mt-2 text-xs text-text-muted">
              {ago === "just now" ? ago : `${ago} ago`}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
