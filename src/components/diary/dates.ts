/**
 * How the diary writes its days and months. A diary day is the listener's own
 * day, stored without a time, so it's read as UTC to stay on that day.
 */

/** "Sat 12 Oct" */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "October 2026", from "2026-10" or any time in it. */
export function monthLabel(monthOrTime: string): string {
  const at = /^\d{4}-\d{2}$/.test(monthOrTime) ? `${monthOrTime}-01T00:00:00Z` : monthOrTime;
  return new Date(at).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "30 Oct" */
export function shortDate(time: string): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "12 minutes ago", "3 hours ago", "2 days ago". */
export function ago(time: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(time)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
