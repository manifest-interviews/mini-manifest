import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Temporal } from "temporal-polyfill";
import { BookingDetailsModal } from "../booking-modal";
import type { Booking, Customer, Organization } from "../db";
import { insert, remove, update, useOrg, useRows } from "../db";
import { formatInstant, formatMoney } from "../schedule";
import { BUTTON, DANGER_BUTTON, INPUT, MemberBadge, Modal, PRIMARY_BUTTON } from "../ui";

export const Route = createFileRoute("/$org/ops/customers")({ component: CustomerList });

const ADD_FORM_ID = "add-customer-form";

function CustomerList() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const customers = useRows("customers", org.id);
  const bookings = useRows("bookings", org.id);

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  // Most recently added first, so a customer you just created is at the top.
  const visible = customers
    .filter((customer) => customer.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Temporal.Instant.compare(b.createdAt, a.createdAt));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customers"
          className={`w-64 ${INPUT}`}
        />
        <button onClick={() => setAdding(true)} className={PRIMARY_BUTTON}>
          Add customer
        </button>
      </div>

      <table className="w-full border border-gray-200 bg-white text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Member</th>
            <th className="px-3 py-2 font-medium">Bookings</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((customer) => (
            <tr key={customer.id} className="border-t border-gray-200 hover:bg-gray-50">
              <td className="px-3 py-2">{customer.name}</td>
              <td className="px-3 py-2">{customer.isMember ? <MemberBadge /> : "—"}</td>
              <td className="px-3 py-2 text-gray-500">
                {bookings.filter((booking) => booking.customerId === customer.id).length}
              </td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => setSelected(customer)} className="underline">
                  Details
                </button>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                No customers.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adding && (
        <AddCustomerModal
          org={org}
          onClose={() => setAdding(false)}
          onAdded={(customer) => {
            setAdding(false);
            setSelected(customer);
          }}
        />
      )}
      {selected && <CustomerDetailsModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** New customer: nothing is written until "Add" is pressed. */
function AddCustomerModal({
  org,
  onClose,
  onAdded,
}: {
  org: Organization;
  onClose: () => void;
  onAdded: (customer: Customer) => void;
}) {
  return (
    <Modal
      title="Add customer"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={BUTTON}>
            Cancel
          </button>
          <button form={ADD_FORM_ID} className={PRIMARY_BUTTON}>
            Add
          </button>
        </>
      }
    >
      <form
        id={ADD_FORM_ID}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);

          onAdded(
            insert("customers", {
              organizationId: org.id,
              name: String(form.get("name")).trim(),
              isMember: form.get("isMember") === "on",
            }),
          );
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Name</span>
          <input name="name" required autoFocus className={`w-full ${INPUT}`} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isMember" />
          <span>This customer is a member</span>
        </label>
      </form>
    </Modal>
  );
}

/** Who they are, plus every booking they have made. Edits save as you type. */
function CustomerDetailsModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);

  const products = useRows("products", customer.organizationId);
  const bookings = useRows("bookings", customer.organizationId).filter(
    (booking) => booking.customerId === customer.id,
  );

  // The row in the store is the source of truth: it re-renders on every write.
  const current =
    useRows("customers", customer.organizationId).find((row) => row.id === customer.id) ?? customer;

  return (
    <Modal
      wide
      title={current.name}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => {
              remove("customers", customer.id);
              onClose();
            }}
            className={`mr-auto ${DANGER_BUTTON}`}
          >
            Delete customer
          </button>
          <button onClick={onClose} className={BUTTON}>
            Close
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Name</span>
          <input
            value={current.name}
            onChange={(event) => update("customers", customer.id, { name: event.target.value })}
            className={`w-full ${INPUT}`}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={current.isMember}
            onChange={(event) =>
              update("customers", customer.id, { isMember: event.target.checked })
            }
          />
          <span>This customer is a member</span>
        </label>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Bookings</h3>

          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 text-sm">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <button
                  onClick={() => setOpenBooking(booking)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span>
                    {products.find((product) => product.id === booking.productId)?.name ?? "?"}
                    <span className="ml-2 text-gray-500">{formatInstant(booking.start)}</span>
                  </span>
                  <span className="text-gray-500">{formatMoney(booking.priceCents)}</span>
                </button>
              </li>
            ))}
            {bookings.length === 0 && (
              <li className="px-3 py-6 text-center text-gray-500">No bookings yet.</li>
            )}
          </ul>
        </section>
      </div>

      {openBooking && (
        <BookingDetailsModal booking={openBooking} onClose={() => setOpenBooking(null)} />
      )}
    </Modal>
  );
}
