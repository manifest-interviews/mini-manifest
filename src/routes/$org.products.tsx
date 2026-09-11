import { createFileRoute } from "@tanstack/react-router";
import { insert, remove, useOrg, useRows } from "../db";
import { describe, WEEKDAYS } from "../schedule";

export const Route = createFileRoute("/$org/products")({ component: Products });

const DEFAULT_TIME = "09:00";
const DEFAULT_DURATION = 60;

function Products() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          insert("products", { organizationId: org.id, name: String(form.get("name")) });
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Product name" required className="border px-2 py-1" />
        <button className="border bg-gray-900 px-3 py-1 text-white">Add product</button>
      </form>

      {products.map((product) => (
        <article key={product.id} className="border border-gray-200 p-4">
          <header className="flex items-center justify-between">
            <h2 className="font-semibold">{product.name}</h2>
            <button onClick={() => remove("products", product.id)} className="text-sm text-red-600">
              Delete
            </button>
          </header>

          <ul className="mt-2 text-sm">
            {schedules
              .filter((schedule) => schedule.productId === product.id)
              .map((schedule) => (
                <li key={schedule.id} className="flex justify-between py-1">
                  <span>{describe(schedule)}</span>
                  <button onClick={() => remove("schedules", schedule.id)} className="text-red-600">
                    Remove
                  </button>
                </li>
              ))}
          </ul>

          <ScheduleForm organizationId={org.id} productId={product.id} />
        </article>
      ))}
    </div>
  );
}

function ScheduleForm({
  organizationId,
  productId,
}: {
  organizationId: string;
  productId: string;
}) {
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        insert("schedules", {
          organizationId,
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

      <input type="time" name="time" defaultValue={DEFAULT_TIME} required className="border px-1" />
      <input
        type="number"
        name="duration"
        min={1}
        defaultValue={DEFAULT_DURATION}
        required
        className="w-20 border px-1"
      />
      <span className="text-gray-500">min</span>
      <button className="border px-2 py-1">Add schedule</button>
    </form>
  );
}
