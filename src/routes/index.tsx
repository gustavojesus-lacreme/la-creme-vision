import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import logo from "@/assets/la-creme-logo-tight.png.asset.json";
import { useSession } from "@/hooks/useSession";
import { readGuest } from "@/lib/guest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA CREME BARBER | Acesso" },
      {
        name: "description",
        content: "Entre ou crie seu cadastro para agendar.",
      },
      { property: "og:title", content: "LA CREME BARBER | Acesso" },
      {
        property: "og:description",
        content: "Entre ou crie seu cadastro para agendar.",
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
    if (session) navigate({ to: "/agendar", replace: true });
  }, [session, loading, navigate]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-sidebar px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <h1 className="sr-only">LA CREME BARBER</h1>
          <img src={logo.url} alt="LA CREME BARBER" className="logo-blend h-auto w-full max-w-xs" />
        </div>

        <div className="mt-8 space-y-3">
          <Link
            to="/auth"
            search={{ modo: "entrar" }}
            className="flex min-h-13 w-full items-center justify-center rounded-lg bg-gold px-6 text-base font-bold text-gold-foreground"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ modo: "cadastro" }}
            className="flex min-h-13 w-full items-center justify-center rounded-lg border border-sidebar-foreground/25 px-6 text-base font-bold text-sidebar-foreground hover:bg-sidebar-accent"
          >
            Criar cadastro
          </Link>
        </div>
      </div>
    </main>
  );
}
