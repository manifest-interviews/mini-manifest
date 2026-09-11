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
export function formatInstant(instant: Temporal.Instant): string {
  return instant.toZonedDateTimeISO(timeZone()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Intl refuses to format an iso8601-calendar PlainYearMonth against a Gregorian
 * locale ("Mismatched calendars"); a ZonedDateTime formats fine.
 */
export function formatMonth(month: Temporal.PlainYearMonth): string {
  return month
    .toPlainDate({ day: 1 })
    .toZonedDateTime(timeZone())
    .toLocaleString(undefined, { year: "numeric", month: "long" });
}

export function describe(rule: Recurrence): string {
  const days = rule.daysOfWeek.map((d) => WEEKDAYS[d - 1]).join("/");
  return `${days || "never"} at ${rule.time} for ${rule.durationMinutes}m`;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Every occurrence of every rule inside [from, until), chronologically. */
export function sessionsBetween<T extends Recurrence>(
  rules: T[],
  from: Temporal.ZonedDateTime,
  until: Temporal.ZonedDateTime,
): (Occurrence & { rule: T })[] {
  const found: (Occurrence & { rule: T })[] = [];

  for (
    let day = from.startOfDay();
    Temporal.ZonedDateTime.compare(day, until) < 0;
    day = day.add({ days: 1 })
  ) {
    for (const rule of rules) {
      if (!rule.daysOfWeek.includes(day.dayOfWeek)) {
        continue;
      }

      const start = day.withPlainTime(Temporal.PlainTime.from(rule.time));
      if (
        Temporal.ZonedDateTime.compare(start, from) < 0 ||
        Temporal.ZonedDateTime.compare(start, until) >= 0
      ) {
        continue;
      }

      found.push({ start, end: start.add({ minutes: rule.durationMinutes }), rule });
    }
  }

  return found.sort((a, b) => Temporal.ZonedDateTime.compare(a.start, b.start));
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
