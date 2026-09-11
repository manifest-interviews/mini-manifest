import { useState } from "react";
import { Temporal } from "temporal-polyfill";
import type { Organization, Schedule } from "./db";
import { insert, useRows } from "./db";
import type { Occurrence } from "./schedule";
import { formatMoney, formatMonth, sessionsBetween, timeZone, WEEKDAYS } from "./schedule";
import { BUTTON, INPUT, Modal, PRIMARY_BUTTON } from "./ui";

const CENTS_PER_UNIT = 100;

const ADD_FORM_ID = "add-booking-form";
const DAYS_IN_WEEK = 7;
const DEFAULT_CHANNEL = "Direct";

/**
 * Product → date → session time → customer → cash taken, in one panel.
 * `preset` skips the first two steps when a session is already in hand.
 */
export function AddBookingModal({
  org,
  preset,
  onClose,
}: {
  org: Organization;
  preset?: { productId: string; session: Occurrence };
  onClose: () => void;
}) {
  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const prices = useRows("prices", org.id);
  const channels = useRows("channels", org.id);

  const [channelId, setChannelId] = useState(
    () => (channels.find((channel) => channel.name === DEFAULT_CHANNEL) ?? channels[0])?.id ?? "",
  );
  const [productId, setProductId] = useState(preset?.productId ?? products[0]?.id ?? "");
  const [date, setDate] = useState<Temporal.PlainDate | null>(
    preset?.session.start.toPlainDate() ?? null,
  );
  const [session, setSession] = useState<Occurrence | null>(preset?.session ?? null);

  const productSchedules = schedules.filter((schedule) => schedule.productId === productId);
  const daySessions = date
    ? sessionsBetween(
        productSchedules,
        date.toZonedDateTime(timeZone()),
        date.add({ days: 1 }).toZonedDateTime(timeZone()),
      )
    : [];

  // The product may simply not be sold on the chosen channel.
  const price = prices.find((row) => row.productId === productId && row.channelId === channelId);

  const pick = (nextProductId: string) => {
    setProductId(nextProductId);
    setDate(null);
    setSession(null);
  };

  return (
    <Modal
      wide
      title="Add booking"
      subtitle="Pick a product, then a date and a session."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={BUTTON}>
            Cancel
          </button>
          <button
            form={ADD_FORM_ID}
            disabled={!session || !price}
            className={`${PRIMARY_BUTTON} disabled:opacity-40`}
          >
            Book
          </button>
        </>
      }
    >
      <form
        id={ADD_FORM_ID}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!session || !price) {
            return;
          }

          const form = new FormData(event.currentTarget);
          const booking = insert("bookings", {
            organizationId: org.id,
            productId,
            channelId,
            priceCents: price.amountCents,
            start: session.start.toInstant(),
            end: session.end.toInstant(),
            customerName: String(form.get("customerName")),
          });

          const amountCents = Math.round(Number(form.get("amount")) * CENTS_PER_UNIT);
          if (amountCents > 0) {
            insert("payments", {
              organizationId: org.id,
              bookingId: booking.id,
              amountCents,
            });
          }

          onClose();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Channel</span>
          <select
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            className={`w-full ${INPUT}`}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Product</span>
          <select
            value={productId}
            onChange={(event) => pick(event.target.value)}
            className={`w-full ${INPUT}`}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm text-gray-500">Date</span>
            <MiniCalendar
              schedules={productSchedules}
              selected={date}
              onSelect={(day) => {
                setDate(day);
                setSession(null);
              }}
            />
          </div>

          <div>
            <span className="mb-1 block text-sm text-gray-500">Session</span>
            {!date && <p className="text-sm text-gray-400">Choose a date first.</p>}
            {date && daySessions.length === 0 && (
              <p className="text-sm text-gray-400">No sessions on that day.</p>
            )}

            <div className="flex flex-wrap gap-2">
              {daySessions.map((slot) => {
                const chosen =
                  session && Temporal.ZonedDateTime.compare(slot.start, session.start) === 0;

                return (
                  <button
                    key={slot.start.toString()}
                    type="button"
                    onClick={() => setSession(slot)}
                    className={`border px-3 py-1.5 text-sm ${
                      chosen
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {slot.start.toPlainTime().toLocaleString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Customer name</span>
          <input name="customerName" required className={`w-full ${INPUT}`} />
        </label>

        <PaymentPanel label="Total due" dueCents={price?.amountCents ?? null} />
      </form>
    </Modal>
  );
}

/** Month grid where only days that actually run a session are selectable. */
function MiniCalendar({
  schedules,
  selected,
  onSelect,
}: {
  schedules: Schedule[];
  selected: Temporal.PlainDate | null;
  onSelect: (day: Temporal.PlainDate) => void;
}) {
  const [month, setMonth] = useState(() =>
    (selected ?? Temporal.Now.plainDateISO()).toPlainYearMonth(),
  );

  const first = month.toPlainDate({ day: 1 });
  const gridStart = first.subtract({ days: first.dayOfWeek - 1 });
  const last = month.toPlainDate({ day: month.daysInMonth });
  const gridEnd = last.add({ days: DAYS_IN_WEEK - last.dayOfWeek });

  const running = new Set(
    sessionsBetween(
      schedules,
      gridStart.toZonedDateTime(timeZone()),
      gridEnd.add({ days: 1 }).toZonedDateTime(timeZone()),
    ).map((slot) => slot.start.toPlainDate().toString()),
  );

  const days: Temporal.PlainDate[] = [];
  for (
    let day = gridStart;
    Temporal.PlainDate.compare(day, gridEnd) <= 0;
    day = day.add({ days: 1 })
  ) {
    days.push(day);
  }

  return (
    <div className="w-fit">
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <button type="button" onClick={() => setMonth(month.subtract({ months: 1 }))}>
          ←
        </button>
        <span className="font-medium">{formatMonth(month)}</span>
        <button type="button" onClick={() => setMonth(month.add({ months: 1 }))}>
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {WEEKDAYS.map((label) => (
          <div key={label} className="py-1 text-gray-400">
            {label[0]}
          </div>
        ))}

        {days.map((day) => {
          const runs = running.has(day.toString());
          const chosen = selected?.equals(day);

          return (
            <button
              key={day.toString()}
              type="button"
              disabled={!runs}
              onClick={() => onSelect(day)}
              className={`h-8 w-8 rounded ${
                chosen
                  ? "bg-gray-900 font-semibold text-white"
                  : runs
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "text-gray-300"
              } ${day.month === month.month ? "" : "opacity-50"}`}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cash panel shared by taking a booking and settling one later. */
export function PaymentPanel({
  label,
  dueCents,
  action,
}: {
  label: string;
  dueCents: number | null; // null when the product is not sold on this channel
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-2 text-sm font-semibold">Payment</h3>

      <div className="mb-3 flex justify-between border-b border-gray-200 pb-2 text-sm">
        <span className="text-gray-500">{label}</span>
        {dueCents === null ? (
          <span className="font-medium text-amber-700">Not sold on this channel</span>
        ) : (
          <span className="font-semibold">{formatMoney(dueCents)}</span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Cash received</span>
          <span className="relative block w-40">
            <span className="absolute top-1.5 left-2 text-gray-400">$</span>
            <input
              key={dueCents ?? "none"}
              type="number"
              name="amount"
              step="0.01"
              min={0}
              disabled={dueCents === null}
              defaultValue={(dueCents ?? 0) / CENTS_PER_UNIT}
              className={`w-full pl-5 ${INPUT} disabled:bg-gray-100`}
            />
          </span>
        </label>
        {action}
      </div>

      {!action && (
        <p className="mt-2 text-xs text-gray-500">Leave it at 0 to book now and collect later.</p>
      )}
    </section>
  );
}
