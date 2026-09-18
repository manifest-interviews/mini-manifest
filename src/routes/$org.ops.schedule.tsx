import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { AddBookingModal } from "../booking-modal";
import type { Schedule } from "../db";
import { useCustomer, useOrg, useRows } from "../db";
import { formatMoney, formatMonth, sessionsBetween, timeZone, WEEKDAYS } from "../schedule";
import { BUTTON, MemberBadge, Modal, PRIMARY_BUTTON } from "../ui";

type Session = { rule: Schedule; start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime };

export const Route = createFileRoute("/$org/ops/schedule")({ component: ScheduleCalendar });

const DAYS_IN_WEEK = 7;

function ScheduleCalendar() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const bookings = useRows("bookings", org.id);

  const [month, setMonth] = useState(() => Temporal.Now.plainDateISO().toPlainYearMonth());
  const [selected, setSelected] = useState<Session | null>(null);
  const [booking, setBooking] = useState<Session | null>(null);

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
                  <li key={session.rule.id + session.start.toString()}>
                    <button
                      onClick={() => setSelected(session)}
                      className="w-full truncate border-l-2 border-blue-500 bg-blue-50 px-1 py-0.5 text-left text-xs hover:bg-blue-100"
                    >
                      {session.start.toPlainTime().toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      {productName(session.rule.productId)}
                      {bookedCount(session.rule.productId, session.start) > 0 && (
                        <span className="ml-1 font-medium text-blue-700">
                          ({bookedCount(session.rule.productId, session.start)})
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {selected && (
        <SessionModal
          session={selected}
          productName={productName(selected.rule.productId)}
          onAddBooking={() => {
            setBooking(selected);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {booking && (
        <AddBookingModal
          org={org}
          preset={{ productId: booking.rule.productId, session: booking }}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}

/** Everything about one instance of a recurrence: details, prices, who is on it. */
function SessionModal({
  session,
  productName,
  onAddBooking,
  onClose,
}: {
  session: Session;
  productName: string;
  onAddBooking: () => void;
  onClose: () => void;
}) {
  const organizationId = session.rule.organizationId;

  const channels = useRows("channels", organizationId);
  const product = useRows("products", organizationId).find(
    (row) => row.id === session.rule.productId,
  );
  const customer = useCustomer(organizationId);
  const payments = useRows("payments", organizationId);
  const prices = useRows("prices", organizationId).filter(
    (price) => price.productId === session.rule.productId,
  );

  const bookings = useRows("bookings", organizationId).filter(
    (booking) =>
      booking.productId === session.rule.productId &&
      Temporal.Instant.compare(booking.start, session.start.toInstant()) === 0,
  );

  const paidFor = (bookingId: string) =>
    payments
      .filter((payment) => payment.bookingId === bookingId)
      .reduce((sum, payment) => sum + payment.amountCents, 0);

  const duration = session.start.until(session.end).total({ unit: "minutes" });

  return (
    <Modal
      wide
      title={productName}
      subtitle={`${session.start.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })} — ${duration} min`}
      onClose={onClose}
      footer={
        <button onClick={onClose} className={BUTTON}>
          Close
        </button>
      }
    >
      <div className="space-y-5">
        {product?.imageUrl && (
          <img
            src={product.imageUrl}
            alt={productName}
            className="h-44 w-full rounded-lg object-cover"
          />
        )}

        <dl className="grid grid-cols-3 divide-x divide-gray-200 rounded-lg bg-gray-50 text-center">
          <Stat label="Booked" value={String(bookings.length)} />
          <Stat
            label="Collected"
            value={formatMoney(bookings.reduce((sum, booking) => sum + paidFor(booking.id), 0))}
          />
          <Stat label="Runs" value={`${duration} min`} />
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Bookings</h3>

          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 text-sm">
            {bookings.map((booking) => (
              <li key={booking.id} className="flex items-center justify-between px-3 py-2">
                <span className="flex items-center gap-2">
                  {customer(booking.customerId)?.name ?? "?"}
                  {customer(booking.customerId)?.isMember && <MemberBadge />}
                </span>
                {paidFor(booking.id) > 0 ? (
                  <span className="text-gray-500">{formatMoney(paidFor(booking.id))}</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    Unpaid
                  </span>
                )}
              </li>
            ))}
            {bookings.length === 0 && (
              <li className="px-3 py-6 text-center text-gray-500">Nobody booked yet.</li>
            )}
          </ul>

          <button onClick={onAddBooking} className={`mt-2 ${PRIMARY_BUTTON}`}>
            Add booking
          </button>
        </section>

        <section className="border-t border-gray-200 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Prices</h3>

          <table className="w-full rounded-lg border border-gray-200 text-sm">
            <tbody>
              {channels.map((channel) => {
                const price = prices.find((row) => row.channelId === channel.id);

                return (
                  <tr key={channel.id} className="border-b border-gray-200 last:border-0">
                    <td className="px-3 py-1.5">{channel.name}</td>
                    <td className="px-3 py-1.5 text-right">
                      {price ? (
                        <span className="font-medium">{formatMoney(price.amountCents)}</span>
                      ) : (
                        <span className="text-gray-400">not sold</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {channels.length === 0 && (
                <tr>
                  <td className="px-3 py-2 text-gray-500">No channels.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
