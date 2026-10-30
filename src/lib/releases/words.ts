import type { ReleaseKind } from "@/lib/app-api";
import { addDays } from "@/lib/push/zones";

/**
 * A new release's kind and day, as the shelf, the bell and pushes say them.
 * Plain rules with no server code, so pages and client components share them.
 */

/** In a sentence: "new album", "new EP". */
export const KIND_WORD: Record<ReleaseKind, string> = { album: "album", ep: "EP" };
/** On its own: "Album", "EP". */
export const KIND_LABEL: Record<ReleaseKind, string> = { album: "Album", ep: "EP" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A stored kind, or null for anything else. */
export function toKind(value: string | null | undefined): ReleaseKind | null {
  return value === "album" || value === "ep" ? value : null;
}

/** "12 Oct", from "2026-10-12". */
export function shortDate(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * How the shelf dates a release, `today` being the viewer's own: "Today",
 * the weekday for one out in the six days before ("Thursday"), otherwise
 * its date ("12 Oct"), coming soon ones included.
 */
export function releaseWhen(day: string, today: string): string {
  if (day === today) return "Today";
  if (day < today && day >= addDays(today, -6)) {
    return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? shortDate(day);
  }
  return shortDate(day);
}
