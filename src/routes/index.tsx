import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA CREME BARBER | Agendar horário" },
      {
        name: "description",
        content: "Agende seu horário na LA CREME BARBER em poucos toques.",
      },
      { property: "og:title", content: "LA CREME BARBER | Agendar horário" },
      {
        property: "og:description",
        content: "Escolha serviço, barbeiro, data e horário disponível.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/agendar" });
  },
  component: () => null,
});
