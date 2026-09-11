import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$org/manage/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$org/manage/settings", params });
  },
});
