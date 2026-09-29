import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app/AppNav";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque | LA CREME BARBER" },
      { name: "description", content: "Controle de estoque da LA CREME BARBER (em breve)." },
      { property: "og:title", content: "Estoque | LA CREME BARBER" },
      { property: "og:description", content: "Controle de estoque em breve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Estoque</h1>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">Em breve</span>
          <p className="mt-3 text-base text-foreground/80">O controle de estoque ainda não está disponível.</p>
        </div>
      </main>
    </div>
  ),
});
