import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useOrg, useTable } from "../db";

export const Route = createFileRoute("/$org")({ component: OrgShell });

function OrgShell() {
  const { org: handle } = Route.useParams();
  const navigate = useNavigate();

  const orgs = useTable("organizations");
  const org = useOrg(handle);

  if (!org) {
    return <p className="p-6">No organization “{handle}”.</p>;
  }

  return (
    <>
      <header className="flex h-14 items-center gap-8 border-b border-gray-200 bg-white px-6">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Organization</span>
          <select
            value={org.handle}
            onChange={(event) =>
              navigate({ to: "/$org/ops/schedule", params: { org: event.target.value } })
            }
            className="border border-gray-300 px-2 py-1"
          >
            {orgs.map((option) => (
              <option key={option.id} value={option.handle}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <nav className="flex gap-6 text-sm">
          <Link
            to="/$org/ops"
            params={{ org: handle }}
            activeProps={{ className: "font-semibold" }}
          >
            Sales
          </Link>
          <Link
            to="/$org/manage"
            params={{ org: handle }}
            activeProps={{ className: "font-semibold" }}
          >
            Settings
          </Link>
        </nav>

        <Link to="/" className="ml-auto text-sm text-gray-500">
          All organizations
        </Link>
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </>
  );
}
