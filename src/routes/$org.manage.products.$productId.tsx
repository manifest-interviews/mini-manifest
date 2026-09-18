import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Schedule } from "../db";
import { insert, remove, update, useOrg, useRows } from "../db";
import { describe, formatMoney, WEEKDAYS } from "../schedule";
import { BUTTON, DANGER_BUTTON, INPUT, Modal, PRIMARY_BUTTON } from "../ui";

export const Route = createFileRoute("/$org/manage/products/$productId")({
  component: ProductPage,
});

const DEFAULT_TIME = "09:00";
const DEFAULT_DURATION = 60;
const CENTS_PER_UNIT = 100;

function ProductPage() {
  const { org: handle, productId } = Route.useParams();
  const org = useOrg(handle)!;
  const navigate = useNavigate();

  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [pricesDirty, setPricesDirty] = useState(false);

  const product = useRows("products", org.id).find((row) => row.id === productId);
  const schedules = useRows("schedules", org.id).filter((row) => row.productId === productId);
  const channels = useRows("channels", org.id);
  const prices = useRows("prices", org.id);

  // Live-preview the image while its URL is edited; images are stored as URLs.
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");

  if (!product) {
    return <p>Product not found.</p>;
  }

  // A blank field means "not sold": drop the row instead of storing a zero.
  const setPrice = (channelId: string, value: string) => {
    const existing = prices.find(
      (price) => price.productId === productId && price.channelId === channelId,
    );

    if (value === "") {
      if (existing) {
        remove("prices", existing.id);
      }
      return;
    }

    const amountCents = Math.round(Number(value) * CENTS_PER_UNIT);

    if (existing) {
      update("prices", existing.id, { amountCents });
      return;
    }

    insert("prices", { organizationId: org.id, productId, channelId, amountCents });
  };

  return (
    <div className="max-w-2xl space-y-8">
      <Link to="/$org/manage/products" params={{ org: handle }} className="text-sm text-gray-500">
        ← Products
      </Link>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          update("products", productId, {
            name: String(form.get("name")),
            imageUrl: String(form.get("imageUrl")),
          });
        }}
      >
        <div className="flex gap-2">
          <input
            name="name"
            defaultValue={product.name}
            required
            className="flex-1 border border-gray-300 px-2 py-1"
          />
          <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Save</button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-gray-500">Image URL</span>
          <input
            name="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            required
            className={`w-full ${INPUT}`}
          />
        </label>

        {imageUrl && (
          <img
            src={imageUrl}
            alt={product.name}
            className="h-48 w-full rounded-lg border border-gray-200 object-cover"
          />
        )}
      </form>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Schedules</h2>
          <button onClick={() => setEditing("new")} className={BUTTON}>
            Add schedule
          </button>
        </div>

        <ul className="divide-y divide-gray-200 border border-gray-200 bg-white text-sm">
          {schedules.map((schedule) => (
            <li key={schedule.id}>
              <button
                onClick={() => setEditing(schedule)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span>{describe(schedule)}</span>
                <span className="text-gray-400">Edit</span>
              </button>
            </li>
          ))}
          {schedules.length === 0 && <li className="px-3 py-2 text-gray-500">No schedules.</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Prices</h2>

        {/* One form for the whole table: submit writes every changed row at once. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);

            for (const channel of channels) {
              setPrice(channel.id, String(form.get(channel.id) ?? "").trim());
            }

            setPricesDirty(false);
          }}
          onChange={() => setPricesDirty(true)}
        >
          <ul className="divide-y divide-gray-200 border border-gray-200 bg-white text-sm">
            {channels.map((channel) => {
              const price = prices.find(
                (row) => row.productId === productId && row.channelId === channel.id,
              );

              return (
                <li key={channel.id} className="flex items-center justify-between px-3 py-2">
                  <span>{channel.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-gray-500">
                      {price ? formatMoney(price.amountCents) : "not sold"}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="—"
                      name={channel.id}
                      defaultValue={price ? price.amountCents / CENTS_PER_UNIT : ""}
                      className="w-24 border border-gray-300 px-1"
                    />
                  </span>
                </li>
              );
            })}
            {channels.length === 0 && <li className="px-3 py-2 text-gray-500">No channels yet.</li>}
          </ul>

          {pricesDirty && <button className={`mt-2 ${PRIMARY_BUTTON}`}>Save prices</button>}
        </form>
      </section>

      <button
        onClick={() => {
          remove("products", productId);
          navigate({ to: "/$org/manage/products", params: { org: handle } });
        }}
        className={DANGER_BUTTON}
      >
        Delete product
      </button>

      {editing && (
        <ScheduleModal
          organizationId={org.id}
          productId={productId}
          schedule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const FORM_ID = "schedule-form";

function ScheduleModal({
  organizationId,
  productId,
  schedule,
  onClose,
}: {
  organizationId: string;
  productId: string;
  schedule?: Schedule;
  onClose: () => void;
}) {
  return (
    <Modal
      title={schedule ? "Edit schedule" : "Add schedule"}
      subtitle="Repeats forever on the selected days."
      onClose={onClose}
      footer={
        <>
          {schedule && (
            <button
              onClick={() => {
                remove("schedules", schedule.id);
                onClose();
              }}
              className={`mr-auto ${DANGER_BUTTON}`}
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className={BUTTON}>
            Cancel
          </button>
          <button form={FORM_ID} className={PRIMARY_BUTTON}>
            Save
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);

          const fields = {
            daysOfWeek: form.getAll("day").map(Number).sort(),
            time: String(form.get("time")),
            durationMinutes: Number(form.get("duration")),
          };

          if (schedule) {
            update("schedules", schedule.id, fields);
          } else {
            insert("schedules", { organizationId, productId, ...fields });
          }

          onClose();
        }}
      >
        <fieldset>
          <legend className="mb-1 text-sm text-gray-500">Days</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {WEEKDAYS.map((label, index) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  name="day"
                  value={index + 1}
                  defaultChecked={schedule?.daysOfWeek.includes(index + 1)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Start time</span>
            <input
              type="time"
              name="time"
              defaultValue={schedule?.time ?? DEFAULT_TIME}
              required
              className={INPUT}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Duration (minutes)</span>
            <input
              type="number"
              name="duration"
              min={1}
              defaultValue={schedule?.durationMinutes ?? DEFAULT_DURATION}
              required
              className={`w-28 ${INPUT}`}
            />
          </label>
        </div>
      </form>
    </Modal>
  );
}
