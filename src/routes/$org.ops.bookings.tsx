import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import type { Booking, Organization } from "../db";
import { insert, remove, useOrg, useRows } from "../db";
import { formatInstant, formatMoney, now, upcoming } from "../schedule";

export const Route = createFileRoute("/$org/ops/bookings")({ component: BookingsList });

const PAGE_SIZE = 10;
const SLOT_COUNT = 30;
const CENTS_PER_UNIT = 100;

function BookingsList() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const bookings = useRows("bookings", org.id);
  const payments = useRows("payments", org.id);

  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Booking | null>(null);
  const addDialog = useRef<HTMLDialogElement>(null);

  // Newest departures first; pagination is plain slicing over the local rows.
  const sorted = [...bookings].sort((a, b) => Temporal.Instant.compare(b.start, a.start));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "?";
  const paidFor = (bookingId: string) =>
    payments
      .filter((payment) => payment.bookingId === bookingId)
      .reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sorted.length} bookings</p>
        <button
          onClick={() => addDialog.current?.showModal()}
          className="bg-gray-900 px-3 py-1.5 text-sm text-white"
        >
          Add booking
        </button>
      </div>

      <table className="w-full border border-gray-200 bg-white text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Starts</th>
            <th className="px-3 py-2 font-medium">Paid</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((booking) => (
            <tr key={booking.id} className="border-t border-gray-200">
              <td className="px-3 py-2">{booking.customerName}</td>
              <td className="px-3 py-2">{productName(booking.productId)}</td>
              <td className="px-3 py-2">{formatInstant(booking.start)}</td>
              <td className="px-3 py-2">{formatMoney(paidFor(booking.id))}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => setSelected(booking)} className="underline">
                  Details
                </button>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                No bookings yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center gap-3 text-sm">
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className="border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-gray-500">
          Page {page + 1} of {pageCount}
        </span>
        <button
          disabled={page + 1 >= pageCount}
          onClick={() => setPage(page + 1)}
          className="border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <AddBookingDialog ref={addDialog} org={org} />
      {selected && (
        <BookingDetails
          booking={selected}
          productName={productName(selected.productId)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function AddBookingDialog({
  ref,
  org,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  org: Organization;
}) {
  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const slots = upcoming(schedules, now(), SLOT_COUNT);

  return (
    <dialog ref={ref} className="m-auto w-96 border border-gray-300 p-4 backdrop:bg-black/30">
      <h2 className="mb-3 font-semibold">Add booking</h2>

      <form
        method="dialog"
        className="space-y-3"
        onSubmit={(event) => {
          const form = new FormData(event.currentTarget);
          const slot = slots[Number(form.get("slot"))];

          insert("bookings", {
            organizationId: org.id,
            productId: slot.rule.productId,
            start: slot.start.toInstant(),
            end: slot.end.toInstant(),
            customerName: String(form.get("customerName")),
          });
        }}
      >
        <select name="slot" required className="w-full border border-gray-300 px-2 py-1 text-sm">
          {slots.map((slot, index) => (
            <option key={slot.rule.id + slot.start.toString()} value={index}>
              {products.find((product) => product.id === slot.rule.productId)?.name} —{" "}
              {slot.start.toLocaleString()}
            </option>
          ))}
        </select>

        <input
          name="customerName"
          required
          placeholder="Customer name"
          className="w-full border border-gray-300 px-2 py-1 text-sm"
        />

        <div className="flex justify-end gap-2 text-sm">
          <button type="button" onClick={() => ref.current?.close()} className="px-3 py-1">
            Cancel
          </button>
          <button disabled={slots.length === 0} className="bg-gray-900 px-3 py-1 text-white">
            Book
          </button>
        </div>
      </form>
    </dialog>
  );
}

function BookingDetails({
  booking,
  productName,
  onClose,
}: {
  booking: Booking;
  productName: string;
  onClose: () => void;
}) {
  const payments = useRows("payments", booking.organizationId).filter(
    (payment) => payment.bookingId === booking.id,
  );
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  // showModal is the only way to get the top layer + backdrop; `open` alone is non-modal.
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-96 border border-gray-300 p-4 backdrop:bg-black/30"
    >
      <h2 className="font-semibold">{booking.customerName}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {productName} — {formatInstant(booking.start)} → {formatInstant(booking.end)}
      </p>

      <h3 className="mt-4 text-sm font-semibold">Payments — {formatMoney(paid)}</h3>
      <ul className="text-sm">
        {payments.map((payment) => (
          <li key={payment.id} className="flex justify-between py-0.5">
            <span>{formatMoney(payment.amountCents)}</span>
            <button onClick={() => remove("payments", payment.id)} className="text-red-600">
              Remove
            </button>
          </li>
        ))}
      </ul>

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
          className="w-28 border border-gray-300 px-2 py-1 text-sm"
        />
        <button className="border border-gray-300 px-2 py-1 text-sm">Take payment</button>
      </form>

      <div className="mt-4 flex justify-between text-sm">
        <button
          onClick={() => {
            remove("bookings", booking.id);
            onClose();
          }}
          className="text-red-600"
        >
          Cancel booking
        </button>
        <button onClick={() => dialog.current?.close()} className="px-3 py-1">
          Close
        </button>
      </div>
    </dialog>
  );
}
