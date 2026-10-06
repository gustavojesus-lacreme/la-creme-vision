import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";

export const sCard = "rounded-xl border border-border/80 bg-card p-4 shadow-card";
export const sInput =
  "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
export const sLabel = "block min-w-0 space-y-1 text-sm font-semibold text-foreground";
export const sBtn = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
export const sBtnOutline = "min-h-12 rounded-md border border-input px-4 text-base font-semibold text-foreground";
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Moldura das telas de configuração: navegação, voltar e acesso restrito ao administrador. */
export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Link to="/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
          <ChevronLeft className="h-4 w-4" /> Configurações
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && <div className={`${sCard} text-center text-base text-foreground/80`}>Acesso restrito ao administrador.</div>}
        {adminQuery.data === true && children}
      </main>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? "border-brand bg-brand" : "border-input bg-secondary"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${checked ? "left-6" : "left-0.5"}`} />
    </button>
  );
}
