import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { remove, reset, update, useOrg, useRows } from "../db";
import { timeZone } from "../schedule";

export const Route = createFileRoute("/$org/manage/settings")({ component: Settings });

function Settings() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;
  const navigate = useNavigate();

  const bookings = useRows("bookings", org.id);

  return (
    <div className="max-w-md space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = String(form.get("handle"));

          update("organizations", org.id, { name: String(form.get("name")), handle: next });

          if (next !== handle) {
            navigate({ to: "/$org/manage/settings", params: { org: next } });
          }
        }}
      >
        <Field label="Name">
          <input
            name="name"
            defaultValue={org.name}
            required
            className="w-full border border-gray-300 px-2 py-1"
          />
        </Field>
        <Field label="Handle">
          <input
            name="handle"
            defaultValue={org.handle}
            required
            className="w-full border border-gray-300 px-2 py-1"
          />
        </Field>

        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Save</button>
      </form>

      <dl className="text-sm text-gray-600">
        <div className="flex gap-2">
          <dt>Time zone</dt>
          <dd className="font-medium text-gray-900">{timeZone()}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Bookings</dt>
          <dd className="font-medium text-gray-900">{bookings.length}</dd>
        </div>
      </dl>

      <div className="flex gap-4 border-t border-gray-200 pt-4 text-sm">
        <button
          onClick={() => {
            remove("organizations", org.id);
            navigate({ to: "/" });
          }}
          className="text-red-600"
        >
          Delete organization
        </button>
        <button
          onClick={() => {
            reset();
            navigate({ to: "/" });
          }}
          className="text-gray-500 underline"
        >
          Reset demo data
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-gray-500">{label}</span>
      {children}
    </label>
  );
}
