import { coverSrc } from "@/lib/cover-url";
import { mostPlayedAlbums } from "@/lib/discover";

/**
 * Two rows of album covers drifting past in opposite directions, under the
 * landing page's headline: the first thing a visitor sees is music. Purely
 * decorative, and still for anyone who prefers less motion.
 */
export default async function CoverWall() {
  const albums = await mostPlayedAlbums(28);
  const covers = albums
    .map((album) => ({ key: album.mbid, src: coverSrc(album.cover_art_url, 250) }))
    .filter((cover): cover is { key: string; src: string } => Boolean(cover.src));

  if (covers.length < 10) return null;

  const rows = [
    covers.filter((_, i) => i % 2 === 0),
    covers.filter((_, i) => i % 2 === 1),
  ];

  return (
    <div
      aria-hidden="true"
      className="-mx-4 flex flex-col gap-3 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] sm:-mx-6"
    >
      {rows.map((row, r) => (
        <div key={r} className={`flex w-max gap-3 ${r === 0 ? "marquee" : "marquee marquee-reverse"}`}>
          {/* Twice over, so the loop has no seam. */}
          {[...row, ...row].map((cover, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${cover.key}-${i}`}
              src={cover.src}
              alt=""
              loading={i < 8 ? "eager" : "lazy"}
              className="artwork h-24 w-24 shrink-0 rounded-lg object-cover sm:h-32 sm:w-32"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
