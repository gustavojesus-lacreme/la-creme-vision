import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { readGuest } from "@/lib/guest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA CREME BARBER | Acesso" },
      {
        name: "description",
        content: "Entre, crie seu cadastro ou continue como visitante para agendar.",
      },
      { property: "og:title", content: "LA CREME BARBER | Acesso" },
      {
        property: "og:description",
        content: "Entre, crie seu cadastro ou continue como visitante para agendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (session || readGuest()) navigate({ to: "/agendar", replace: true });
  }, [session, loading, navigate]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Scissors className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
            LA CREME BARBER
          </h1>
        </div>

        <div className="mt-8 space-y-3">
          <Link
            to="/auth"
            search={{ modo: "entrar" }}
            className="flex min-h-13 w-full items-center justify-center rounded-md bg-brand px-6 text-base font-bold text-brand-foreground"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ modo: "cadastro" }}
            className="flex min-h-13 w-full items-center justify-center rounded-md border border-input bg-background px-6 text-base font-bold text-foreground"
          >
            Criar cadastro
          </Link>
          <Link
            to="/auth"
            search={{ modo: "visitante" }}
            className="flex min-h-13 w-full items-center justify-center rounded-md border border-input bg-background px-6 text-base font-semibold text-foreground"
          >
            Continuar como visitante
          </Link>
        </div>
      </div>
    </main>
  );
}
