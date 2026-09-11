import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$org/ops")({ component: Sales });

function Sales() {
  const { org } = Route.useParams();

  return (
    <div className="space-y-4">
      <nav className="flex gap-4 border-b border-gray-200 text-sm">
        <Link
          to="/$org/ops/schedule"
          params={{ org }}
          activeProps={{ className: "border-b-2 border-gray-900 font-semibold" }}
          className="-mb-px px-1 pb-2"
        >
          Schedule
        </Link>
        <Link
          to="/$org/ops/bookings"
          params={{ org }}
          activeProps={{ className: "border-b-2 border-gray-900 font-semibold" }}
          className="-mb-px px-1 pb-2"
        >
          Bookings
        </Link>
      </nav>

      <Outlet />
    </div>
  );
}
