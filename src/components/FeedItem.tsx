import Link from "next/link";
import Avatar from "@/components/Avatar";
import Reactions from "@/components/Reactions";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import type { FeedItem as Item } from "@/lib/feed";
import { SIDES } from "@/lib/versus-shared";
import { buttonClass } from "@/components/ui";

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

/** Both artists side by side; once it can be seen, the one they picked in full colour. */
function PickArt({ item }: { item: Of<"pick"> }) {
  const { matchup, pick, revealed } = item;

  return (
    <Link
      href={`/versus/${matchup.day}`}
      aria-label={matchup.title}
      className="artwork relative flex h-20 w-20 shrink-0 overflow-hidden rounded-lg transition-transform group-hover:scale-[1.02]"
    >
      {SIDES.map((side) => {
        const src = artistPhotoSrc(matchup[side].image, 200);
        const faded = revealed && side !== pick;
        return (
          <span key={side} className="relative block h-full w-1/2 overflow-hidden bg-surface-raised">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                loading="lazy"
                className={`h-full w-full object-cover object-top ${faded ? "opacity-30 grayscale" : ""}`}
              />
            )}
          </span>
        );
      })}
      <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-bg text-[9px] font-extrabold text-accent">
        {revealed ? "VS" : "?"}
      </span>
    </Link>
  );
}

function PickDetails({ item }: { item: Of<"pick"> }) {
  const { matchup, pick, revealed } = item;

  return (
    <>
      <p className={EYEBROW}>Daily Versus</p>
      <Link href={`/versus/${matchup.day}`} className={TITLE}>
        {matchup.title}
      </Link>
      <p className="truncate text-sm text-text-secondary">
        {matchup.left.name} vs {matchup.right.name}
      </p>
      {revealed ? (
        <p className="mt-2 text-sm text-text-secondary">
          Picked <span className="display-sm text-accent">{matchup[pick].name}</span>
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-text-secondary">Picked a side.</span>
          <Link href="/versus" className={buttonClass({ size: "sm" })}>
            Pick yours to see
          </Link>
        </div>
      )}
    </>
  );
}

export default function FeedItem({
  item,
  showAuthor = true,
  signedIn = false,
  readOnly = false,
}: {
  item: Item;
  showAuthor?: boolean;
  signedIn?: boolean;
  /** On your own ratings: the counts, with nothing to press. */
  readOnly?: boolean;
}) {
  const ago = timeAgo(item.created_at);

  // A grouped song item is many ratings at once, so there is nothing single
  // to love or disagree with; a pick you can't see yet can't be judged.
  const reactable = item.kind !== "songs" && (item.kind !== "pick" || item.revealed);
  const hasReactions =
    reactable && (item.reaction.love > 0 || item.reaction.dislike > 0);

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
            {item.kind === "pick" ? "picked" : "rated"} · {ago}
          </span>
        </div>
      )}

      <div className="flex gap-4">
        {item.kind === "pick" ? (
          <PickArt item={item} />
        ) : item.kind === "artist" ? (
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
          {item.kind === "pick" && <PickDetails item={item} />}

          {!showAuthor && (
            <p className="mt-2 text-xs text-text-muted">
              {ago === "just now" ? ago : `${ago} ago`}
            </p>
          )}
        </div>
      </div>

      {reactable && (!readOnly || hasReactions) && (
        <div className="mt-3.5">
          <Reactions
            kind={item.kind}
            ratingId={item.ratingId}
            summary={item.reaction}
            signedIn={signedIn}
            readOnly={readOnly}
          />
        </div>
      )}
    </li>
  );
}
