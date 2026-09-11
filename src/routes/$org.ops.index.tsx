import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$org/ops/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$org/ops/schedule", params });
  },
});
