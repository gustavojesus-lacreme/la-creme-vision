import { createFileRoute, redirect } from "@tanstack/react-router";

// Old invite address: forwards to the current one.
export const Route = createFileRoute("/convite/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/convite/barbeiro/$token", params: { token: params.token }, replace: true });
  },
});
