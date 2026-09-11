import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$org/manage")({ component: Settings });

const TAB_CLASS = "-mb-px px-1 pb-2";
const ACTIVE_TAB = { className: "border-b-2 border-gray-900 font-semibold" };

function Settings() {
  const { org } = Route.useParams();

  return (
    <div className="space-y-4">
      <nav className="flex gap-4 border-b border-gray-200 text-sm">
        <Link
          to="/$org/manage/settings"
          params={{ org }}
          activeProps={ACTIVE_TAB}
          className={TAB_CLASS}
        >
          Organization
        </Link>
        <Link
          to="/$org/manage/products"
          params={{ org }}
          activeProps={ACTIVE_TAB}
          className={TAB_CLASS}
        >
          Products
        </Link>
        <Link
          to="/$org/manage/channels"
          params={{ org }}
          activeProps={ACTIVE_TAB}
          className={TAB_CLASS}
        >
          Channels
        </Link>
      </nav>

      <Outlet />
    </div>
  );
}
