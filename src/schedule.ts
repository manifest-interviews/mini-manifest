import { Temporal } from "temporal-polyfill";

/**
 * Recurrence is deliberately not iCal: a set of weekdays + a wall-clock time,
 * repeating forever. "Every Mon/Wed/Fri at 09:00 for 90 minutes" is
 * { daysOfWeek: [1, 3, 5], time: "09:00", durationMinutes: 90 }.
 */
export type Recurrence = {
  daysOfWeek: number[]; // ISO weekday, 1 = Monday .. 7 = Sunday
  time: string; // "HH:MM"
  durationMinutes: number;
};

export type Occurrence = { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime };

// A schedule with no weekdays selected never matches; stop scanning after a year.
const MAX_SCAN_DAYS = 366;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function timeZone(): string {
  return Temporal.Now.timeZoneId();
}

export function now(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO();
}

/** The next `limit` occurrences of `rule` at or after `from`, in wall-clock time. */
export function occurrences(
  rule: Recurrence,
  from: Temporal.ZonedDateTime,
  limit: number,
): Occurrence[] {
  const time = Temporal.PlainTime.from(rule.time);
  const found: Occurrence[] = [];

  let day = from.startOfDay();

  for (let scanned = 0; found.length < limit && scanned < MAX_SCAN_DAYS; scanned++) {
    const candidate = day;
    day = day.add({ days: 1 });

    if (!rule.daysOfWeek.includes(candidate.dayOfWeek)) {
      continue;
    }

    // withPlainTime resolves DST gaps/overlaps for us (e.g. 02:30 on a spring-forward day).
    const start = candidate.withPlainTime(time);
    if (Temporal.ZonedDateTime.compare(start, from) < 0) {
      continue; // today's slot has already started
    }

    found.push({ start, end: start.add({ minutes: rule.durationMinutes }) });
  }

  return found;
}

/** Human-readable local time for a stored instant. */
export function formatInstant(iso: string): string {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function describe(rule: Recurrence): string {
  const days = rule.daysOfWeek.map((d) => WEEKDAYS[d - 1]).join("/");
  return `${days || "never"} at ${rule.time} for ${rule.durationMinutes}m`;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Merged, chronologically sorted occurrences across several recurrences. */
export function upcoming<T extends Recurrence>(
  rules: T[],
  from: Temporal.ZonedDateTime,
  limit: number,
): (Occurrence & { rule: T })[] {
  return rules
    .flatMap((rule) => occurrences(rule, from, limit).map((slot) => ({ ...slot, rule })))
    .sort((a, b) => Temporal.ZonedDateTime.compare(a.start, b.start))
    .slice(0, limit);
}
