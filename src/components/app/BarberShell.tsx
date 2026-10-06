import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import { sCard } from "@/components/app/SettingsShell";

/** Moldura das telas do barbeiro ativo. Entrega o id do barbeiro aos filhos. */
export function BarberShell({ title, back, children }: { title: string; back?: boolean; children: (barberId: string) => ReactNode }) {
  const q = useQuery({ queryKey: ["panel-access-page"], queryFn: getPanelAccess });
  const a = q.data;
  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        {back && (
          <Link to="/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
            <ChevronLeft className="h-4 w-4" /> Configurações
          </Link>
        )}
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
        {q.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {!q.isLoading && a?.role !== "barbeiro" && <div className={`${sCard} text-center text-base text-foreground/80`}>Acesso restrito ao barbeiro.</div>}
        {a?.role === "barbeiro" && children(a.barberId)}
      </main>
    </div>
  );
}
