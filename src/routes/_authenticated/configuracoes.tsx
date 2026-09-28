import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, Coffee, CalendarOff, Scissors, Layers, Users, Contact, BadgeCheck,
  ListChecks, Bell, SlidersHorizontal, ChevronRight, type LucideIcon,
} from "lucide-react";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | LA CREME BARBER" },
      { name: "description", content: "Configurações da barbearia organizadas por categoria." },
      { property: "og:title", content: "Configurações | LA CREME BARBER" },
      { property: "og:description", content: "Área administrativa de configurações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Item = {
  icon: LucideIcon;
  title: string;
  desc: string;
  to?: "/ausencias" | "/admin-servicos" | "/admin-barbeiros" | "/admin-clientes";
};

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Operação",
    items: [
      { icon: Clock, title: "Horários de funcionamento", desc: "Defina os dias e horários em que a barbearia funciona" },
      { icon: Coffee, title: "Intervalos e almoço", desc: "Configure os períodos de pausa e disponibilidade" },
      { icon: CalendarOff, title: "Ausências dos barbeiros", desc: "Gerencie férias, atestados, emergências e ausências", to: "/ausencias" },
    ],
  },
  {
    title: "Serviços",
    items: [
      { icon: Scissors, title: "Serviços e preços", desc: "Cadastre serviços, valores e durações", to: "/admin-servicos" },
      { icon: Layers, title: "Combinações de serviços", desc: "Preços especiais para serviços feitos juntos", to: "/admin-servicos" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { icon: Users, title: "Barbeiros", desc: "Equipe, convites, ativação e QR Code para clientes", to: "/admin-barbeiros" },
      { icon: Contact, title: "Clientes", desc: "Consulte e gerencie os clientes cadastrados", to: "/admin-clientes" },
      { icon: BadgeCheck, title: "Planos", desc: "Planos e assinaturas para clientes" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { icon: ListChecks, title: "Regras de agendamento", desc: "Antecedência, cancelamento e limites" },
      { icon: Bell, title: "Notificações", desc: "Avisos para clientes e barbeiros" },
      { icon: SlidersHorizontal, title: "Configurações gerais", desc: "Dados da barbearia e preferências" },
    ],
  },
];

function Row({ item }: { item: Item }) {
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-secondary text-brand">
        <item.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-card-foreground">{item.title}</span>
        <span className="block text-sm text-foreground/65">{item.desc}</span>
      </span>
      {item.to ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" />
      ) : (
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          Em breve
        </span>
      )}
    </>
  );
  const cls = "flex min-h-16 items-center gap-3 px-4 py-3";
  return item.to ? (
    <Link to={item.to} className={`${cls} transition-colors hover:bg-secondary/60`}>{inner}</Link>
  ) : (
    <div className={`${cls} opacity-70`} aria-disabled="true">{inner}</div>
  );
}

function SettingsPage() {
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && (
          <div className="rounded-lg border border-border bg-card p-4 text-center text-base text-foreground/80">
            Acesso restrito ao administrador.
          </div>
        )}
        {adminQuery.data === true &&
          groups.map((g) => (
            <section key={g.title} className="space-y-2">
              <h2 className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-gold">{g.title}</h2>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {g.items.map((it) => <Row key={it.title} item={it} />)}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}

