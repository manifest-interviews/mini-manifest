import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { insert, remove, update, useOrg, useRows } from "../db";
import { describe, formatMoney, WEEKDAYS } from "../schedule";

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

  const product = useRows("products", org.id).find((row) => row.id === productId);
  const schedules = useRows("schedules", org.id).filter((row) => row.productId === productId);
  const channels = useRows("channels", org.id);
  const prices = useRows("prices", org.id);

  if (!product) {
    return <p>Product not found.</p>;
  }

  const setPrice = (channelId: string, amountCents: number) => {
    const existing = prices.find(
      (price) => price.productId === productId && price.channelId === channelId,
    );

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
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          update("products", productId, { name: String(form.get("name")) });
        }}
      >
        <input
          name="name"
          defaultValue={product.name}
          required
          className="flex-1 border border-gray-300 px-2 py-1"
        />
        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Save</button>
      </form>

      <section>
        <h2 className="mb-2 font-semibold">Schedules</h2>

        <ul className="mb-3 divide-y divide-gray-200 border border-gray-200 bg-white text-sm">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex justify-between px-3 py-2">
              <span>{describe(schedule)}</span>
              <button onClick={() => remove("schedules", schedule.id)} className="text-red-600">
                Remove
              </button>
            </li>
          ))}
          {schedules.length === 0 && <li className="px-3 py-2 text-gray-500">No schedules.</li>}
        </ul>

        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);

            insert("schedules", {
              organizationId: org.id,
              productId,
              daysOfWeek: form.getAll("day").map(Number).sort(),
              time: String(form.get("time")),
              durationMinutes: Number(form.get("duration")),
            });

            event.currentTarget.reset();
          }}
        >
          {WEEKDAYS.map((label, index) => (
            <label key={label} className="flex items-center gap-1">
              <input type="checkbox" name="day" value={index + 1} />
              {label}
            </label>
          ))}

          <input
            type="time"
            name="time"
            defaultValue={DEFAULT_TIME}
            required
            className="border border-gray-300 px-1"
          />
          <input
            type="number"
            name="duration"
            min={1}
            defaultValue={DEFAULT_DURATION}
            required
            className="w-20 border border-gray-300 px-1"
          />
          <span className="text-gray-500">min</span>
          <button className="border border-gray-300 bg-white px-2 py-1">Add schedule</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Prices</h2>

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
                    defaultValue={price ? price.amountCents / CENTS_PER_UNIT : ""}
                    onBlur={(event) => {
                      const value = event.currentTarget.value;
                      if (value !== "") {
                        setPrice(channel.id, Math.round(Number(value) * CENTS_PER_UNIT));
                      }
                    }}
                    className="w-24 border border-gray-300 px-1"
                  />
                </span>
              </li>
            );
          })}
          {channels.length === 0 && <li className="px-3 py-2 text-gray-500">No channels yet.</li>}
        </ul>
      </section>

      <button
        onClick={() => {
          remove("products", productId);
          navigate({ to: "/$org/manage/products", params: { org: handle } });
        }}
        className="text-sm text-red-600"
      >
        Delete product
      </button>
    </div>
  );
}
