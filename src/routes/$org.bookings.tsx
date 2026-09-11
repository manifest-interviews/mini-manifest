import { createFileRoute } from "@tanstack/react-router";
import type { Booking } from "../db";
import { insert, remove, useOrg, useRows } from "../db";
import { formatInstant, formatMoney, now, upcoming } from "../schedule";

export const Route = createFileRoute("/$org/bookings")({ component: Bookings });

const SLOT_COUNT = 20;
const CENTS_PER_UNIT = 100;

function Bookings() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const bookings = useRows("bookings", org.id);

  const slots = upcoming(schedules, now(), SLOT_COUNT);
  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "?";

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const slot = slots[Number(form.get("slot"))];

          insert("bookings", {
            organizationId: org.id,
            productId: slot.rule.productId,
            start: slot.start.toInstant().toString(),
            end: slot.end.toInstant().toString(),
            customerName: String(form.get("customerName")),
          });

          event.currentTarget.reset();
        }}
      >
        <select name="slot" required className="border px-2 py-1">
          {slots.map((slot, index) => (
            <option key={slot.start.toString() + slot.rule.id} value={index}>
              {productName(slot.rule.productId)} — {slot.start.toLocaleString()}
            </option>
          ))}
        </select>
        <input name="customerName" placeholder="Customer" required className="border px-2 py-1" />
        <button disabled={slots.length === 0} className="border bg-gray-900 px-3 py-1 text-white">
          Book
        </button>
      </form>

      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          productName={productName(booking.productId)}
        />
      ))}
      {bookings.length === 0 && <p className="text-sm text-gray-500">No bookings yet.</p>}
    </div>
  );
}

function BookingRow({ booking, productName }: { booking: Booking; productName: string }) {
  const payments = useRows("payments", booking.organizationId).filter(
    (payment) => payment.bookingId === booking.id,
  );
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <article className="border border-gray-200 p-3 text-sm">
      <header className="flex items-center justify-between">
        <span>
          <strong>{booking.customerName}</strong> — {productName}, {formatInstant(booking.start)} →{" "}
          {formatInstant(booking.end)}
        </span>
        <button onClick={() => remove("bookings", booking.id)} className="text-red-600">
          Cancel
        </button>
      </header>

      <p className="mt-1 text-gray-600">Paid {formatMoney(paid)}</p>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);

          insert("payments", {
            organizationId: booking.organizationId,
            bookingId: booking.id,
            amountCents: Math.round(Number(form.get("amount")) * CENTS_PER_UNIT),
          });

          event.currentTarget.reset();
        }}
      >
        <input
          type="number"
          name="amount"
          step="0.01"
          min={0}
          required
          placeholder="Amount"
          className="w-28 border px-2 py-1"
        />
        <button className="border px-2 py-1">Take payment</button>
      </form>
    </article>
  );
}
