import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, Coffee, CalendarOff, Scissors, Layers, Users, Contact, BadgeCheck,
  ListChecks, Bell, SlidersHorizontal, ChevronRight, QrCode, type LucideIcon,
} from "lucide-react";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { User as UserIcon } from "lucide-react";

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

const accountGroup = { title: "Minha Conta", items: [{ icon: UserIcon, title: "Minha conta", desc: "Dados pessoais, e-mail, senha, segurança e sair", to: "/minha-conta" as const }] };

type Item = {
  icon: LucideIcon;
  title: string;
  desc: string;
  to?: "/minha-conta" | "/ausencias" | "/admin-servicos" | "/admin-barbeiros" | "/admin-qrcode" | "/admin-clientes" | "/config-horarios" | "/config-intervalos" | "/config-planos" | "/config-regras" | "/config-notificacoes" | "/config-gerais";
};

const groups: { title: string; items: Item[] }[] = [
  accountGroup,
  {
    title: "Operação",
    items: [
      { icon: Clock, title: "Horários de funcionamento", desc: "Defina os dias e horários em que a barbearia funciona", to: "/config-horarios" },
      { icon: Coffee, title: "Intervalos e almoço", desc: "Configure os períodos de pausa e disponibilidade", to: "/config-intervalos" },
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
      { icon: Users, title: "Barbeiros", desc: "Equipe, convites e ativação", to: "/admin-barbeiros" },
      { icon: QrCode, title: "QR Code para clientes", desc: "Link oficial de agendamento para imprimir", to: "/admin-qrcode" },
      { icon: Contact, title: "Clientes", desc: "Consulte e gerencie os clientes cadastrados", to: "/admin-clientes" },
      { icon: BadgeCheck, title: "Planos", desc: "Planos e assinaturas para clientes", to: "/config-planos" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { icon: ListChecks, title: "Regras de agendamento", desc: "Antecedência, cancelamento e limites", to: "/config-regras" },
      { icon: Bell, title: "Notificações", desc: "Avisos para clientes e barbeiros", to: "/config-notificacoes" },
      { icon: SlidersHorizontal, title: "Configurações gerais", desc: "Dados da barbearia e preferências", to: "/config-gerais" },
    ],
  },
];

function Row({ item }: { item: Item }) {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/[0.06] text-brand">
        <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-card-foreground">{item.title}</span>
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
  const accessQuery = useQuery({ queryKey: ["panel-access-page"], queryFn: getPanelAccess });
  const role = accessQuery.data?.role;
  const adminQuery = { isLoading: accessQuery.isLoading, data: accessQuery.isLoading ? undefined : role === "admin" };
  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {role === "barbeiro" && <BarberSettings />}
        {adminQuery.data === false && role !== "barbeiro" && (
          <section className="space-y-2">
            <h2 className="px-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">{accountGroup.title}</h2>
            <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
              {accountGroup.items.map((it) => <Row key={it.title} item={it} />)}
            </div>
          </section>
        )}
        {adminQuery.data === true &&
          groups.map((g) => (
            <section key={g.title} className="space-y-2">
              <h2 className="px-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">{g.title}</h2>
              <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {g.items.map((it) => <Row key={it.title} item={it} />)}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}


const barberGroups: { title: string; items: { icon: LucideIcon; title: string; desc: string; to: "/meu-perfil" | "/minha-disponibilidade" | "/ausencias" }[] }[] = [
  { title: "Minha Conta", items: [{ icon: UserIcon, title: "Minha conta", desc: "Dados pessoais, foto, e-mail, senha, segurança e sair", to: "/meu-perfil" }] },
  {
    title: "Disponibilidade",
    items: [
      { icon: Clock, title: "Minha disponibilidade", desc: "Dias de trabalho, horário e início do almoço", to: "/minha-disponibilidade" },
      { icon: CalendarOff, title: "Minhas ausências", desc: "Emergência, afastamento médico e bloqueios", to: "/ausencias" },
    ],
  },
];

function BarberSettings() {
  const ns = useQuery({
    queryKey: ["notification-settings-barber"],
    queryFn: async () => (await supabase.from("notification_settings").select("key, label, enabled").eq("audience", "barbeiro").order("sort_order")).data ?? [],
  });
  return (
    <>
      {barberGroups.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="px-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">{g.title}</h2>
          <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
            {g.items.map((it) => <Row key={it.title} item={it as unknown as Item} />)}
          </div>
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="px-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">Notificações</h2>
        <div className="divide-y divide-border/70 rounded-xl border border-border/80 bg-card shadow-card">
          {ns.data?.map((n) => (
            <div key={n.key} className="flex min-h-12 items-center justify-between gap-3 px-4">
              <span className="text-base">{n.label}</span>
              <span className={`text-sm font-semibold ${n.enabled ? "text-brand" : "text-foreground/50"}`}>{n.enabled ? "Ativa" : "Desativada"}</span>
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-foreground/60">Definido pela administração.</p>
        </div>
      </section>
    </>
  );
}
