import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <nav className="mb-8 flex gap-4">
        <Link to="/">Organizations</Link>
      </nav>
      <Outlet />
    </div>
  );
}
