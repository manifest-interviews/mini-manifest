import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { useOrg, useRows } from "../db";
import { formatMonth, sessionsBetween, timeZone, WEEKDAYS } from "../schedule";

export const Route = createFileRoute("/$org/ops/schedule")({ component: ScheduleCalendar });

const DAYS_IN_WEEK = 7;

function ScheduleCalendar() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const bookings = useRows("bookings", org.id);

  const [month, setMonth] = useState(() => Temporal.Now.plainDateISO().toPlainYearMonth());

  // The grid always shows whole weeks: pad back to Monday and forward to Sunday.
  const gridStart = useMemo(() => {
    const first = month.toPlainDate({ day: 1 });
    return first.subtract({ days: first.dayOfWeek - 1 });
  }, [month]);

  const gridEnd = useMemo(() => {
    const last = month.toPlainDate({ day: month.daysInMonth });
    return last.add({ days: DAYS_IN_WEEK - last.dayOfWeek });
  }, [month]);

  const sessionsByDay = useMemo(() => {
    const zone = timeZone();
    const sessions = sessionsBetween(
      schedules,
      gridStart.toZonedDateTime(zone),
      gridEnd.add({ days: 1 }).toZonedDateTime(zone),
    );

    const byDay = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const key = session.start.toPlainDate().toString();
      byDay.set(key, [...(byDay.get(key) ?? []), session]);
    }

    return byDay;
  }, [schedules, gridStart, gridEnd]);

  const days: Temporal.PlainDate[] = [];
  for (
    let day = gridStart;
    Temporal.PlainDate.compare(day, gridEnd) <= 0;
    day = day.add({ days: 1 })
  ) {
    days.push(day);
  }

  const today = Temporal.Now.plainDateISO();
  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "?";

  // A session is "booked" by any booking on the same product starting at the same instant.
  const bookedCount = (productId: string, start: Temporal.ZonedDateTime) =>
    bookings.filter(
      (booking) =>
        booking.productId === productId &&
        Temporal.Instant.compare(Temporal.Instant.from(booking.start), start.toInstant()) === 0,
    ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMonth(month.subtract({ months: 1 }))}
          className="border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold">{formatMonth(month)}</h2>
        <button
          onClick={() => setMonth(month.add({ months: 1 }))}
          className="border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          →
        </button>
        <button
          onClick={() => setMonth(today.toPlainYearMonth())}
          className="ml-2 text-sm text-gray-500 underline"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 border-l border-t border-gray-200 bg-white">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="border-r border-b border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500"
          >
            {label}
          </div>
        ))}

        {days.map((day) => {
          const sessions = sessionsByDay.get(day.toString()) ?? [];
          const outside = day.month !== month.month;

          return (
            <div
              key={day.toString()}
              className={`min-h-28 border-r border-b border-gray-200 p-1 ${
                outside ? "bg-gray-50 text-gray-400" : ""
              }`}
            >
              <div
                className={`mb-1 text-xs ${
                  day.equals(today) ? "font-bold text-blue-600" : "text-gray-500"
                }`}
              >
                {day.day}
              </div>

              <ul className="space-y-1">
                {sessions.map((session) => (
                  <li
                    key={session.rule.id + session.start.toString()}
                    className="truncate border-l-2 border-blue-500 bg-blue-50 px-1 py-0.5 text-xs"
                    title={`${productName(session.rule.productId)} ${session.start.toLocaleString()}`}
                  >
                    {session.start.toPlainTime().toLocaleString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    {productName(session.rule.productId)}
                    {bookedCount(session.rule.productId, session.start) > 0 && (
                      <span className="ml-1 text-blue-700">
                        ({bookedCount(session.rule.productId, session.start)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
