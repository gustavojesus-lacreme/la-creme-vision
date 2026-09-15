import { createFileRoute, Link } from "@tanstack/react-router";
import { Scissors } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA CREME BARBER | Agendamento rápido" },
      {
        name: "description",
        content: "Agende seu horário na LA CREME BARBER em poucos toques.",
      },
      { property: "og:title", content: "LA CREME BARBER | Agendamento rápido" },
      {
        property: "og:description",
        content: "Entre, escolha o serviço e agende seu horário na LA CREME BARBER.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccessScreen,
});

function AccessScreen() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Scissors className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
            LA CREME BARBER
          </h1>
          <p className="mt-2 text-base text-foreground/70">Agende seu horário</p>
        </div>

        <div className="mt-10 space-y-3">
          <Link
            to="/auth"
            search={{ modo: "entrar" }}
            className="flex min-h-13 w-full items-center justify-center rounded-md bg-brand px-6 py-3 text-base font-bold text-brand-foreground"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ modo: "cadastro" }}
            className="flex min-h-13 w-full items-center justify-center rounded-md border border-brand bg-background px-6 py-3 text-base font-bold text-brand"
          >
            Criar cadastro
          </Link>
          <Link
            to="/agendar"
            className="flex min-h-13 w-full items-center justify-center rounded-md px-6 py-3 text-base font-semibold text-foreground/80 underline underline-offset-4"
          >
            Continuar como visitante
          </Link>
        </div>
      </div>
    </main>
  );
}
