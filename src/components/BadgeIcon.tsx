/**
 * A glyph for every badge.
 *
 * Every badge used to wear the same gold star, which made a wall of them
 * read as one texture rather than a collection. A crate, a cassette, a
 * safety pin — each one says what it took at a glance, and the difference
 * between them is what makes a full board worth looking at.
 *
 * All of them are drawn on a 24 grid, geometric rather than illustrative, and
 * inherit their colour from the text around them so the same glyph works gold
 * when earned and grey when locked. Stroked shapes share one width, which is
 * what keeps a set drawn over an afternoon looking like a set.
 */

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A vinyl record: the shape most of the "listening" badges are built on. */
function disc(r = 8.5) {
  return (
    <>
      <circle cx="12" cy="12" r={r} />
      <circle cx="12" cy="12" r="1.4" />
    </>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  // Starting out ------------------------------------------------------------
  "first-spin": (
    <>
      {disc()}
      <path d="M12 6.4a5.6 5.6 0 0 1 5.6 5.6" />
    </>
  ),
  "raised-on": (
    <>
      {disc(7.2)}
      <path d="M4 20.5c2.4-2 5-3 8-3s5.6 1 8 3" />
    </>
  ),
  "on-the-record": (
    <>
      <path d="M15.8 4.6l3.6 3.6L9.2 18.4l-4.6 1 1-4.6z" />
      <path d="M13.6 6.8l3.6 3.6" />
    </>
  ),
  "the-crew": (
    <>
      <circle cx="9" cy="9.2" r="3" />
      <path d="M3.6 19.4c0-3 2.4-5 5.4-5s5.4 2 5.4 5" />
      <path d="M16.2 7.1a3 3 0 0 1 0 5.9" />
      <path d="M17 14.9c2.1.6 3.4 2.3 3.4 4.5" />
    </>
  ),

  // Going deep --------------------------------------------------------------
  "track-by-track": (
    <>
      <path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
      <path d="M3.6 6.4l1.4 1.4 2.2-2.4M3.6 11.9l1.4 1.4 2.2-2.4M3.6 17.4l1.4 1.4 2.2-2.4" />
    </>
  ),
  "no-skips": (
    <>
      <path d="M5.4 6.6l7 5.4-7 5.4z" />
      <path d="M15.4 6.6v10.8" />
      <path d="M19.6 4.8L4.4 19.2" />
    </>
  ),
  discography: (
    <>
      <circle cx="12" cy="8.4" r="4.4" />
      <circle cx="12" cy="8.4" r="1" />
      <path d="M4.6 13.4c1.6 2 4.3 3.3 7.4 3.3s5.8-1.3 7.4-3.3" />
      <path d="M4.6 17.4c1.6 2 4.3 3.3 7.4 3.3s5.8-1.3 7.4-3.3" />
    </>
  ),
  "box-set": (
    <>
      <path d="M3.6 8.2h16.8v11.2H3.6z" />
      <path d="M3.6 8.2l2.2-3.6h12.4l2.2 3.6" />
      <path d="M8.4 12.2h7.2" />
      <path d="M8.4 15.6h7.2" />
    </>
  ),
  century: (
    <>
      <circle cx="12" cy="10.4" r="5.4" />
      <path d="M12 7.6v5.6M9.6 10.4h4.8" />
      <path d="M8.2 15.1L6.4 21l5.6-2.6L17.6 21l-1.8-5.9" />
    </>
  ),
  "crate-digger": (
    <>
      <path d="M3.6 7.6h16.8v11.8H3.6z" />
      <path d="M3.6 7.6l1.6-3h13.6l1.6 3" />
      <path d="M7.6 11v5M10.6 11v5M13.6 11v5M16.6 11v5" />
    </>
  ),

  // Range -------------------------------------------------------------------
  "a-and-r": (
    <>
      <path d="M6 4.6h12v14.8H6z" />
      <path d="M9.4 4.6V3.2h5.2v1.4" />
      <path d="M12 8.4l1.5 3.1 3.3.5-2.4 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.4-2.4 3.3-.5z" />
    </>
  ),
  "time-traveller": (
    <>
      <circle cx="12" cy="12.4" r="7.4" />
      <path d="M12 8.2v4.4l2.8 1.8" />
      <path d="M4.8 6.4v3.6h3.6" />
    </>
  ),
  omnivore: (
    <>
      <circle cx="9.2" cy="9.6" r="4.6" />
      <circle cx="14.8" cy="9.6" r="4.6" />
      <circle cx="12" cy="14.6" r="4.6" />
    </>
  ),
  "the-whole-night": (
    <>
      <path d="M19.4 14.6A7.6 7.6 0 0 1 9.2 4.8a7.8 7.8 0 1 0 10.2 9.8z" />
      <path d="M16.6 4.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />
    </>
  ),

  // Your calls --------------------------------------------------------------
  "liner-notes": (
    <>
      <path d="M5.4 3.6h9.4l4 4v12.8H5.4z" />
      <path d="M14.4 3.6v4.2h4.2" />
      <path d="M8.4 12h7.2M8.4 15.4h7.2M8.4 8.6h3.4" />
    </>
  ),
  certified: (
    <>
      <circle cx="12" cy="9.4" r="5.6" />
      <path d="M12 6.6l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
      <path d="M8.4 14.2L7 20.4l5-2.2 5 2.2-1.4-6.2" />
    </>
  ),
  "tough-crowd": (
    <>
      <path d="M13.4 3.4l7.2 7.2-2.8 2.8-7.2-7.2z" />
      <path d="M8.6 8.2l7.2 7.2" />
      <path d="M4.2 20.4h9.2" />
      <path d="M6.4 12.6l4.6 4.6-2.2 2.2-4.6-4.6z" />
    </>
  ),
  "goat-status": (
    <>
      <path d="M3.4 8.2l3.8 3.2 4.8-6.4 4.8 6.4 3.8-3.2-1.8 10.4H5.2z" />
      <path d="M5.2 18.6h13.6" />
    </>
  ),
  mixtape: (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="12" r="2" />
      <path d="M8.2 18l1.4-2.6h4.8l1.4 2.6" />
    </>
  ),

  // The crowd ---------------------------------------------------------------
  ringside: (
    <>
      <path d="M4.2 9.4a3.2 3.2 0 0 1 3.2-3.2h3.6a3.2 3.2 0 0 1 3.2 3.2v3.4a4 4 0 0 1-4 4H8.2a4 4 0 0 1-4-4z" />
      <path d="M14.2 8.6h1.8a2.4 2.4 0 0 1 0 4.8h-1.8" />
      <path d="M7 17.6v2.2h5.4v-2.2" />
      <path d="M8 6.2V4.4" />
    </>
  ),
  "hot-take": (
    <>
      <path d="M20.4 12.6c0 3.8-3.8 6.8-8.4 6.8a10 10 0 0 1-2.6-.3L4.6 21l1.2-3.6a6.4 6.4 0 0 1-2.2-4.8c0-3.8 3.8-6.8 8.4-6.8s8.4 3 8.4 6.8z" />
      <path d="M12 9.2c1.2 1 1.6 2 1.2 3 .8-.2 1.2-.7 1.4-1.4.6 1.3.4 2.7-.6 3.5-1.2 1-3 .8-3.8-.4-.7-1.1-.2-2.6 1.8-4.7z" />
    </>
  ),
  "co-sign": (
    <>
      <path d="M12 20.2l-6.6-6.3a4.1 4.1 0 0 1 0-6 4.6 4.6 0 0 1 6.6 0 4.6 4.6 0 0 1 6.6 0 4.1 4.1 0 0 1 0 6z" />
      <path d="M9.8 12.4l1.5 1.5 3-3.2" />
    </>
  ),
  "day-ones": (
    <>
      <path d="M3.2 19.4h17.6" />
      <path d="M6.6 19.4a5.4 5.4 0 0 1 10.8 0" />
      <path d="M12 4.2v2.6M5.4 7.4l1.8 1.8M18.6 7.4l-1.8 1.8" />
    </>
  ),

  // Genre families ----------------------------------------------------------
  "hip-hop": (
    <>
      <rect x="9.4" y="2.8" width="5.2" height="10" rx="2.6" />
      <path d="M6.6 11.2a5.4 5.4 0 0 0 10.8 0" />
      <path d="M12 16.6v4.6M9.2 21.2h5.6" />
    </>
  ),
  pop: (
    <>
      <path d="M12 2.6l2.4 6.4 6.4 2.4-6.4 2.4L12 20.2l-2.4-6.4L3.2 11.4l6.4-2.4z" />
      <path d="M18.8 17.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  rock: (
    <>
      <path d="M12 3.2c4 0 6.6 2.6 6.6 6 0 4-3.4 7.6-6.6 11.6C8.8 16.8 5.4 13.2 5.4 9.2c0-3.4 2.6-6 6.6-6z" />
      <path d="M13.6 7.4l-3 4.4h2.6l-1.4 3.6" />
    </>
  ),
  soul: (
    <>
      <path d="M12 20l-6.4-6.1a4 4 0 0 1 0-5.8 4.4 4.4 0 0 1 6.4 0 4.4 4.4 0 0 1 6.4 0 4 4 0 0 1 0 5.8z" />
      <path d="M6.6 12.2h2.2l1.4-2.6 1.8 5 1.6-3.4 1 1h2.8" />
    </>
  ),
  electronic: (
    <>
      <path d="M6 3.6v16.8M12 3.6v16.8M18 3.6v16.8" />
      <circle cx="6" cy="8.6" r="2" />
      <circle cx="12" cy="15" r="2" />
      <circle cx="18" cy="7" r="2" />
    </>
  ),
  metal: (
    <>
      <path d="M13.6 2.6L5.2 13.4h5.2l-1.6 8 9-11.2h-5.4z" />
    </>
  ),
  country: (
    <>
      <path d="M7.6 13.4l1-7.2a2.2 2.2 0 0 1 2.6-1.9l2 .4a2.2 2.2 0 0 1 1.8 2.5l-.6 6.4" />
      <path d="M2.6 15.6c2.8-2 6-3 9.4-3s6.6 1 9.4 3c-2.8 2-6 3-9.4 3s-6.6-1-9.4-3z" />
    </>
  ),
  jazz: (
    <>
      <path d="M13.6 3.4v9.4a3.4 3.4 0 1 1-2-3.1" />
      <path d="M13.6 3.4c3 .6 4.6 2.2 4.8 4.8" />
      <path d="M17.4 14.6l1 1.8 1.8 1-1.8 1-1 1.8-1-1.8-1.8-1 1.8-1z" />
    </>
  ),
  punk: (
    <>
      <path d="M6.8 8.2v8.2a3.6 3.6 0 0 0 7.2 0V7.4a2.4 2.4 0 0 1 4.8 0v8.2" />
      <path d="M5.2 8.2h7.6" />
      <circle cx="18.8" cy="17.4" r="1.8" />
    </>
  ),
  reggae: (
    <>
      <rect x="5.4" y="2.8" width="13.2" height="18.4" rx="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="12" cy="15.6" r="3.2" />
    </>
  ),
  folk: (
    <>
      <path d="M13.8 3.2l4.4 4.4" />
      <path d="M15.6 7.6l-3.4 3.4" />
      <ellipse cx="9.4" cy="14.8" rx="6.2" ry="5.8" />
      <circle cx="9.4" cy="14.8" r="2.2" />
    </>
  ),
  latin: (
    <>
      <path d="M6.4 8.6h11.2l-1.4 11a1.8 1.8 0 0 1-1.8 1.6H9.6a1.8 1.8 0 0 1-1.8-1.6z" />
      <ellipse cx="12" cy="8.6" rx="5.6" ry="2.6" />
      <path d="M8.2 13.2h7.6" />
    </>
  ),
};

/**
 * The glyph for a badge slug. Genre tiers ("hip-hop-3") fall back to their
 * family's glyph, so the four rungs of a ladder share one mark; anything with
 * no glyph at all falls back to a plain record, which is never wrong on MULO.
 */
export default function BadgeIcon({
  slug,
  className = "h-5 w-5",
}: {
  slug: string;
  className?: string;
}) {
  const family = slug.replace(/-[1-4]$/, "");
  const glyph = GLYPHS[slug] ?? GLYPHS[family] ?? disc();

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...S}>
      {glyph}
    </svg>
  );
}
