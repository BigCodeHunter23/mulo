/**
 * Time zones, for streaks and pushes that run on each person's own clock.
 * Daily Versus and The Drop keep Sydney's, being one contest for everybody.
 */

export const SYDNEY = "Australia/Sydney";

/** Whether this is a time zone the runtime knows, such as "Europe/London". */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Somebody's zone, or Sydney's when they have none we know. */
export function zoneOrSydney(value: string | null | undefined): string {
  return isTimeZone(value) ? value : SYDNEY;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formats.set(timeZone, format);
  }
  return format;
}

/** The date ("2026-10-29") and minutes past midnight at a moment, somewhere. */
export function localClock(at: Date, timeZone: string): { day: string; minutes: number } {
  const parts = formatFor(timeZone).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}
