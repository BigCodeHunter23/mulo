"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { coverSrc } from "@/lib/cover-url";
import type { FriendScore } from "@/lib/friend-scores";
import CoverImage from "@/components/CoverImage";
import FriendFaces from "@/components/FriendFaces";
import { Score, type ScoreKind } from "@/components/StarScore";
import QuickRate from "@/components/QuickRate";
import { haptic } from "@/lib/haptics";

/** How long a press has to last to open the score sheet instead of the page. */
const HOLD_MS = 450;
/** A finger that moves this far is scrolling, not holding. */
const SLOP = 10;

/**
 * Cover, title and a line of detail, for album grids across the site.
 *
 * A tap opens the album; pressing and holding the cover opens a sheet to
 * score it on the spot, so a grid can be rated without leaving it.
 */
export default function AlbumCard({
  mbid,
  title,
  artist,
  year,
  coverUrl,
  score,
  scoreKind = "overall",
  mine,
  friends = [],
  eager = false,
}: {
  mbid: string;
  title: string;
  artist?: string | null;
  year?: string | null;
  coverUrl: string | null;
  /** Pass a value (or null for unrated) to show a score. */
  score?: number | null;
  /** Whose score it is: the crowd's by default, or one person's. */
  scoreKind?: ScoreKind;
  /** The signed-in person's own score, stamped on the cover so rated albums stand out. */
  mine?: number;
  /** People you follow who have rated it, shown as faces under the card. */
  friends?: FriendScore[];
  /** For the first row of a page, so it isn't held back by lazy loading. */
  eager?: boolean;
}) {
  const src = coverSrc(coverUrl, 250);
  const detail = [artist, year].filter(Boolean).join(" · ");
  const [yours, setYours] = useState(mine);
  // A fresh score from the server (after a refresh, say) replaces the local one.
  const [given, setGiven] = useState(mine);
  if (given !== mine) {
    setGiven(mine);
    setYours(mine);
  }
  const [open, setOpen] = useState(false);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);

  function cancel() {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  }

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Link
        href={`/album/${mbid}`}
        className="group block select-none [-webkit-touch-callout:none]"
        onPointerDown={(event) => {
          held.current = false;
          cancel();
          const timer = setTimeout(() => {
            held.current = true;
            hold.current = null;
            haptic("select");
            setOpen(true);
          }, HOLD_MS);
          hold.current = { timer, x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = hold.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(event) => {
          // A long press on a phone would otherwise open the browser's own link menu.
          if (held.current || hold.current) event.preventDefault();
        }}
        onClick={(event) => {
          // The press that opened the sheet shouldn't also open the page.
          if (held.current) {
            event.preventDefault();
            held.current = false;
          }
        }}
      >
        <div className="artwork relative aspect-square overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.97]">
          <CoverImage
            key={src ?? "none"}
            src={src}
            alt={title}
            eager={eager}
            draggable={false}
            className="h-full w-full object-cover"
          />
          {yours !== undefined && (
            <span
              title={`You rated it ${yours}`}
              className="absolute right-1.5 top-1.5 min-w-7 rounded-md bg-score-you px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-[#0b0b0e] shadow-md"
            >
              {yours}
            </span>
          )}
        </div>
        <p className="display-sm mt-2.5 line-clamp-1 text-sm text-text transition-colors group-hover:text-accent">
          {title}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-text-muted">{detail}</span>
          {score !== undefined && (
            <Score kind={scoreKind} value={score} size="sm" showLabel={false} />
          )}
        </div>
        {/* Under the card rather than on the artwork: the cover already
            carries your own score, and two things on one picture is one too
            many. */}
        {friends.length > 0 && <FriendFaces friends={friends} className="mt-1.5" />}
      </Link>
      {open && (
        <QuickRate
          mbid={mbid}
          title={title}
          artist={artist}
          coverUrl={coverUrl}
          current={yours}
          onClose={close}
          onRated={setYours}
        />
      )}
    </>
  );
}
