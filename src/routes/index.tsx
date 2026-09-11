import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { insert, useTable } from "../db";

export const Route = createFileRoute("/")({ component: Organizations });

function Organizations() {
  const orgs = useTable("organizations");
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md space-y-4 p-10">
      <h1 className="text-xl font-semibold">Organizations</h1>

      <ul className="divide-y divide-gray-200 border border-gray-200 bg-white">
        {orgs.map((org) => (
          <li key={org.id}>
            <Link
              to="/$org/ops/schedule"
              params={{ org: org.handle }}
              className="block px-3 py-2 hover:bg-gray-50"
            >
              {org.name} <span className="text-sm text-gray-500">/{org.handle}</span>
            </Link>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const org = insert("organizations", {
            name: String(form.get("name")),
            handle: String(form.get("handle")),
          });

          navigate({ to: "/$org/manage/settings", params: { org: org.handle } });
        }}
      >
        <input
          name="name"
          required
          placeholder="Name"
          className="border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          name="handle"
          required
          placeholder="handle"
          className="w-28 border border-gray-300 px-2 py-1 text-sm"
        />
        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Add</button>
      </form>
    </div>
  );
}
