import { createFileRoute, redirect } from "@tanstack/react-router";

// A tela de bloqueio foi unida à tela de horários; este endereço antigo apenas leva até lá.
export const Route = createFileRoute("/_authenticated/bloquear-agenda")({
  head: () => ({
    meta: [
      { title: "Bloquear agenda | LA CREME BARBER" },
      { name: "description", content: "Dias e horários bloqueados agora ficam na tela de horários." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/config-horarios" });
  },
  component: () => null,
});
