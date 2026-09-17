"use client";

import { useState } from "react";

/**
 * Long text, cut to a few lines until asked for. Short text shows as it is,
 * with no button.
 */
export default function ReadMore({
  text,
  lines = 4,
  className = "",
}: {
  text: string;
  lines?: 3 | 4 | 5;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // A rough measure, so short bios never get a pointless button.
  const long = text.length > lines * 90;

  const clamp = { 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5" }[lines];

  return (
    <div className={className}>
      <p className={`text-sm leading-relaxed text-text-secondary ${open || !long ? "" : clamp}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-1.5 text-sm font-medium text-text transition-colors hover:text-accent"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
