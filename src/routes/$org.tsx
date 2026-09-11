import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useOrg } from "../db";

export const Route = createFileRoute("/$org")({ component: OrgLayout });

const TABS = [
  { to: "/$org", label: "Overview", exact: true },
  { to: "/$org/products", label: "Products", exact: false },
  { to: "/$org/channels", label: "Channels & prices", exact: false },
  { to: "/$org/bookings", label: "Bookings", exact: false },
] as const;

function OrgLayout() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle);

  if (!org) {
    return <p>No organization “{handle}”.</p>;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">{org.name}</h1>

      <nav className="flex gap-4 border-b border-gray-200 pb-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            to={tab.to}
            params={{ org: handle }}
            activeOptions={{ exact: tab.exact }}
            activeProps={{ className: "font-semibold underline" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </section>
  );
}
