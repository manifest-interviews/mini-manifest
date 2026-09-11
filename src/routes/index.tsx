import { createFileRoute, Link } from "@tanstack/react-router";
import { insert, remove, reset, useTable } from "../db";

export const Route = createFileRoute("/")({ component: Organizations });

function Organizations() {
  const orgs = useTable("organizations");

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Organizations</h1>

      <ul className="divide-y divide-gray-200 border-y border-gray-200">
        {orgs.map((org) => (
          <li key={org.id} className="flex items-center justify-between py-2">
            <Link to="/$org" params={{ org: org.handle }} className="underline">
              {org.name} <span className="text-gray-500">/{org.handle}</span>
            </Link>
            <button
              onClick={() => remove("organizations", org.id)}
              className="text-sm text-red-600"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          insert("organizations", {
            name: String(form.get("name")),
            handle: String(form.get("handle")),
          });
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Name" required className="border px-2 py-1" />
        <input name="handle" placeholder="handle" required className="border px-2 py-1" />
        <button className="border bg-gray-900 px-3 py-1 text-white">Add</button>
      </form>

      <button onClick={reset} className="text-sm text-gray-500 underline">
        Reset demo data
      </button>
    </section>
  );
}
