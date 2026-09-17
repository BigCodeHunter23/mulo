import Link from "next/link";
import { artistPhotoSrc } from "@/lib/cover-url";

/** A round artist photo with the name beneath, for artist grids. */
export default function ArtistCard({
  mbid,
  name,
  imageUrl,
  eager = false,
}: {
  mbid: string;
  name: string;
  imageUrl: string | null;
  /** For photos near the top of a page, so they aren't held back by lazy loading. */
  eager?: boolean;
}) {
  const src = artistPhotoSrc(imageUrl, 300);

  return (
    <Link
      href={`/artist/${mbid}`}
      className="group flex flex-col items-center gap-2.5 text-center"
    >
      <div className="artwork aspect-square w-full overflow-hidden rounded-full transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.97]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            loading={eager ? "eager" : "lazy"}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-muted">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-sm font-medium text-text transition-colors group-hover:text-accent">
        {name}
      </span>
    </Link>
  );
}
