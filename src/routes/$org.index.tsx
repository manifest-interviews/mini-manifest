import { createFileRoute } from "@tanstack/react-router";
import { useOrg, useRows } from "../db";
import { formatInstant, formatMoney, now, upcoming } from "../schedule";

export const Route = createFileRoute("/$org/")({ component: Overview });

const UPCOMING_COUNT = 5;

function Overview() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);
  const bookings = useRows("bookings", org.id);
  const payments = useRows("payments", org.id);

  const collected = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const slots = upcoming(schedules, now(), UPCOMING_COUNT);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-4 gap-4 text-sm">
        <Stat label="Products" value={String(products.length)} />
        <Stat label="Schedules" value={String(schedules.length)} />
        <Stat label="Bookings" value={String(bookings.length)} />
        <Stat label="Collected" value={formatMoney(collected)} />
      </dl>

      <div>
        <h2 className="mb-2 font-semibold">Next departures</h2>
        <ul className="text-sm">
          {slots.map((slot) => (
            <li key={slot.start.toString() + slot.rule.id}>
              {slot.start.toLocaleString()} — {productName(slot.rule.productId)}
            </li>
          ))}
          {slots.length === 0 && <li className="text-gray-500">No schedules yet.</li>}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Latest bookings</h2>
        <ul className="text-sm">
          {bookings
            .slice(-UPCOMING_COUNT)
            .reverse()
            .map((booking) => (
              <li key={booking.id}>
                {booking.customerName} — {productName(booking.productId)},{" "}
                {formatInstant(booking.start)}
              </li>
            ))}
          {bookings.length === 0 && <li className="text-gray-500">No bookings yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 p-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
