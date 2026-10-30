/**
 * Time zones, for streaks and pushes that run on each person's own clock.
 * Daily Versus and The Drop keep Sydney's, being one contest for everybody.
 */

export const SYDNEY = "Australia/Sydney";

/**
 * A time zone the runtime knows, in its own spelling ("europe/london" is
 * "Europe/London"), or null. Zones are saved this way, so one place is never
 * two zones, nor two cached formats.
 */
export function canonicalZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Whether this is a time zone the runtime knows, such as "Europe/London". */
export function isTimeZone(value: unknown): value is string {
  return canonicalZone(value) !== null;
}

/** Somebody's zone, or Sydney's when they have none we know. */
export function zoneOrSydney(value: string | null | undefined): string {
  return canonicalZone(value) ?? SYDNEY;
}

/** One format per zone, kept under the zone's own spelling so the cache can't grow past the zones there are. */
const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formats.get(timeZone);
  if (cached) return cached;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const canonical = format.resolvedOptions().timeZone;
  const known = formats.get(canonical);
  if (known) return known;
  formats.set(canonical, format);
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

/** The day `days` after `day`, or before it when negative: "2026-10-30" and 2 is "2026-11-01". */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The moment the clock in `timeZone` reads `minutes` past midnight on `day`:
 * 10am on a release day, say. Guessed as if the zone were UTC, then moved by
 * however far off the zone's own clock reads, twice over for the days the
 * clocks change.
 */
export function momentAt(day: string, minutes: number, timeZone: string): Date {
  const wanted = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localClock(new Date(guess), timeZone);
    guess += wanted - (Date.parse(`${local.day}T00:00:00Z`) + local.minutes * 60_000);
  }
  return new Date(guess);
}
