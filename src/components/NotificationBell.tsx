"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The bell in the header, with a dot when something's new. It checks after
 * every page change, since the header doesn't re-render as you move around,
 * and treats the notifications page itself as read.
 */
export default function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(false);
  const onPage = pathname === "/notifications";

  useEffect(() => {
    if (onPage) return;

    const controller = new AbortController();
    fetch("/api/notifications/unread", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { unread: false }))
      .then((data: { unread?: boolean }) => setUnread(Boolean(data.unread)))
      .catch(() => {
        // Left alone: a missed check just means no dot until the next page.
      });

    return () => controller.abort();
  }, [pathname, onPage]);

  const showDot = unread && !onPage;

  return (
    <Link
      href="/notifications"
      aria-label={showDot ? "Notifications, something new" : "Notifications"}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {showDot && (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" />
      )}
    </Link>
  );
}
