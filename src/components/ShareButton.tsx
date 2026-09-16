"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/**
 * On a phone this opens the normal share sheet, so a GOAT list can go straight
 * into a group chat with its preview picture. Where there's no share sheet,
 * it copies the link instead.
 */
export default function ShareButton({
  url,
  title,
  text,
  label = "Share",
}: {
  /** A path on this site, such as /u/alex. */
  url: string;
  title: string;
  text?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    const link = new URL(url, window.location.origin).toString();

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: link });
        return;
      } catch (error) {
        // Closing the share sheet isn't a failure; anything else falls through.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt("Copy this link", link);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={buttonClass({ variant: "secondary", size: "sm" })}
    >
      <ShareIcon />
      <span aria-live="polite">{copied ? "Link copied" : label}</span>
    </button>
  );
}
