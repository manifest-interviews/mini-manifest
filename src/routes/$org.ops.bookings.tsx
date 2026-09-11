import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Temporal } from "temporal-polyfill";
import { AddBookingModal, PaymentPanel } from "../booking-modal";
import type { Booking } from "../db";
import { insert, remove, useOrg, useRows } from "../db";
import { formatInstant, formatMoney } from "../schedule";
import { BUTTON, DANGER_BUTTON, Modal, PRIMARY_BUTTON } from "../ui";

export const Route = createFileRoute("/$org/ops/bookings")({ component: BookingsList });

const PAGE_SIZE = 10;
const CENTS_PER_UNIT = 100;

function BookingsList() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const channels = useRows("channels", org.id);
  const bookings = useRows("bookings", org.id);
  const payments = useRows("payments", org.id);

  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);

  // Most recently booked first; pagination is plain slicing over the local rows.
  const sorted = [...bookings].sort((a, b) => Temporal.Instant.compare(b.createdAt, a.createdAt));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "?";
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? "?";
  const paidFor = (bookingId: string) =>
    payments
      .filter((payment) => payment.bookingId === bookingId)
      .reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sorted.length} bookings</p>
        <button onClick={() => setAdding(true)} className={PRIMARY_BUTTON}>
          Add booking
        </button>
      </div>

      <table className="w-full border border-gray-200 bg-white text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Channel</th>
            <th className="px-3 py-2 font-medium">Starts</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Paid</th>
            <th className="px-3 py-2 font-medium">Balance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((booking) => {
            const balance = booking.priceCents - paidFor(booking.id);

            return (
              <tr key={booking.id} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-3 py-2">{booking.customerName}</td>
                <td className="px-3 py-2">{productName(booking.productId)}</td>
                <td className="px-3 py-2 text-gray-500">{channelName(booking.channelId)}</td>
                <td className="px-3 py-2">{formatInstant(booking.start)}</td>
                <td className="px-3 py-2">{formatMoney(booking.priceCents)}</td>
                <td className="px-3 py-2">{formatMoney(paidFor(booking.id))}</td>
                <td
                  className={`px-3 py-2 ${balance > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}
                >
                  {balance > 0 ? formatMoney(balance) : "Settled"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setSelected(booking)} className="underline">
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
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
          className={`${BUTTON} disabled:opacity-40`}
        >
          Previous
        </button>
        <span className="text-gray-500">
          Page {page + 1} of {pageCount}
        </span>
        <button
          disabled={page + 1 >= pageCount}
          onClick={() => setPage(page + 1)}
          className={`${BUTTON} disabled:opacity-40`}
        >
          Next
        </button>
      </div>

      {adding && <AddBookingModal org={org} onClose={() => setAdding(false)} />}
      {selected && (
        <BookingModal
          booking={selected}
          productName={productName(selected.productId)}
          channelName={channelName(selected.channelId)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function BookingModal({
  booking,
  productName,
  channelName,
  onClose,
}: {
  booking: Booking;
  productName: string;
  channelName: string;
  onClose: () => void;
}) {
  const payments = useRows("payments", booking.organizationId).filter(
    (payment) => payment.bookingId === booking.id,
  );
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const balance = booking.priceCents - paid;

  return (
    <Modal
      title={booking.customerName}
      subtitle={`${productName} via ${channelName} — ${formatInstant(booking.start)} → ${formatInstant(
        booking.end,
      )}`}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => {
              remove("bookings", booking.id);
              onClose();
            }}
            className={`mr-auto ${DANGER_BUTTON}`}
          >
            Cancel booking
          </button>
          <button onClick={onClose} className={BUTTON}>
            Close
          </button>
        </>
      }
    >
      <dl className="mb-4 grid grid-cols-3 divide-x divide-gray-200 rounded-lg bg-gray-50 text-center text-sm">
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">Price</dt>
          <dd className="font-semibold">{formatMoney(booking.priceCents)}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">Paid</dt>
          <dd className="font-semibold">{formatMoney(paid)}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">Balance</dt>
          <dd className={`font-semibold ${balance > 0 ? "text-amber-700" : ""}`}>
            {formatMoney(balance)}
          </dd>
        </div>
      </dl>

      <h3 className="mb-1 text-sm font-semibold">Payments</h3>

      <ul className="divide-y divide-gray-200 border border-gray-200 text-sm">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between px-3 py-1.5">
            <span>{formatMoney(payment.amountCents)}</span>
            <button onClick={() => remove("payments", payment.id)} className="text-red-600">
              Remove
            </button>
          </li>
        ))}
        {payments.length === 0 && <li className="px-3 py-1.5 text-gray-500">Nothing paid yet.</li>}
      </ul>

      {balance > 0 && (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);

            insert("payments", {
              organizationId: booking.organizationId,
              bookingId: booking.id,
              amountCents: Math.round(Number(form.get("amount")) * CENTS_PER_UNIT),
            });
          }}
        >
          <PaymentPanel
            label="Balance due"
            dueCents={balance}
            action={<button className={`${BUTTON} mb-0.5`}>Take payment</button>}
          />
        </form>
      )}
    </Modal>
  );
}
