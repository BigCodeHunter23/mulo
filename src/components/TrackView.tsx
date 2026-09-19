"use client";

import { useEffect } from "react";
import { rememberViewed, type Viewed } from "@/lib/recently-viewed";

/** Notes an album or artist page as opened, for "Recently viewed" on search. Renders nothing. */
export default function TrackView(item: Viewed) {
  const { kind, mbid, title, subtitle, image } = item;
  useEffect(() => {
    rememberViewed({ kind, mbid, title, subtitle, image });
  }, [kind, mbid, title, subtitle, image]);
  return null;
}
