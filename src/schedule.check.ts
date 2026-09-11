// Self-check for the recurrence expansion: node --experimental-strip-types src/schedule.check.ts
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { occurrences, type Recurrence } from "./schedule.ts";

const mwf: Recurrence = { daysOfWeek: [1, 3, 5], time: "09:00", durationMinutes: 90 };
const sunday = Temporal.ZonedDateTime.from("2026-09-13T12:00[America/Los_Angeles]");

const next = occurrences(mwf, sunday, 4);
assert.deepEqual(
  next.map((o) => o.start.toString({ timeZoneName: "never" })),
  [
    "2026-09-14T09:00:00-07:00",
    "2026-09-16T09:00:00-07:00",
    "2026-09-18T09:00:00-07:00",
    "2026-09-21T09:00:00-07:00",
  ],
);
assert.equal(next[0].end.toString({ timeZoneName: "never" }), "2026-09-14T10:30:00-07:00");

// A slot earlier today is skipped, a later one is kept.
const monday = Temporal.ZonedDateTime.from("2026-09-14T10:00[America/Los_Angeles]");
assert.equal(
  occurrences(mwf, monday, 1)[0].start.toString({ timeZoneName: "never" }),
  "2026-09-16T09:00:00-07:00",
);

// No weekdays selected: terminates instead of scanning forever.
assert.deepEqual(occurrences({ ...mwf, daysOfWeek: [] }, sunday, 5), []);

console.log("schedule.check ok");
