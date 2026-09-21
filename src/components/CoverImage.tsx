"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Artwork that steps aside when it fails to load.
 *
 * Some records have no cover anywhere — the Cover Art Archive answers 404 and
 * the browser draws its broken-image icon, which looks far worse than an empty
 * sleeve. Anything that fails is dropped in favour of the tile behind it, or
 * whatever fallback the card wants to show instead.
 */
export default function CoverImage({
  src,
  alt,
  className = "",
  eager = false,
  draggable,
  fallback = null,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  draggable?: boolean;
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // The markup arrives from the server, so a cover that 404s has usually
  // failed before React ever attaches the handler below — and a missed error
  // event is never replayed. A finished image with no width is a failed one.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (!src || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      draggable={draggable}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
