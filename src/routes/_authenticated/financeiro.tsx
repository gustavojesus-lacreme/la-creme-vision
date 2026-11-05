import { useState, type ReactNode } from "react";
import { generateFinancePdf, generateProfessionalPdf, type ReportKind } from "@/lib/finance-pdf";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, PERIODS, brl, periodRange, rangeToIso, summarize, toCents,
  barberPerf, adminTotals, paid, net, pct,
  type Entry, type PaymentMethod, type PeriodKey, type CommissionSettings,
  isCounted, professionalReport, TEAM_ROLE_LABEL, groupAttendances, type Attendance,
} from "@/lib/finance";
import { todaySP, formatDay } from "@/lib/absences";
import { PaymentCorrections } from "@/components/app/PaymentCorrections";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro | LA CREME BARBER" },
      { name: "description", content: "Faturamento, movimentações, comissões, despesas e relatórios da barbearia." },
      { property: "og:title", content: "Financeiro | LA CREME BARBER" },
      { property: "og:description", content: "Gestão financeira da LA CREME BARBER." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

const TABS = [
  { key: "geral", label: "Visão geral" },
  { key: "mov", label: "Movimentações" },
  { key: "cor", label: "Corrigir pagamentos" },
  { key: "com", label: "Comissões" },
  { key: "desp", label: "Despesas" },
  { key: "rel", label: "Relatórios" },
  { key: "pag", label: "Formas de pagamento" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const card = "rounded-xl border border-border/80 bg-card p-4 shadow-card";
const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const label = "block min-w-0 space-y-1 text-sm font-semibold text-foreground";
const btn = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnGhost = "min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground";

type Barber = { id: string; name: string; team_role?: string; commission_plan_pct?: number | null };

function useFinanceData(range: { from: string; to: string }, enabled: boolean) {
  const iso = rangeToIso(range);
  const entries = useQuery({
    queryKey: ["fin-entries", range.from, range.to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_entries").select("*")
        .gte("occurred_at", iso.from).lt("occurred_at", iso.to).order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  return entries;
}

function FinancePage() {
  const accessQuery = useQuery({ queryKey: ["panel-access-fin"], queryFn: getPanelAccess });
  const isAdmin = accessQuery.data?.role === "admin";
  const ownBarberId = accessQuery.data?.role === "barbeiro" ? accessQuery.data.barberId : null;
  const canSee = isAdmin || !!ownBarberId;
  const correctionAccess = useQuery({ queryKey: ["payment-correction-access", ownBarberId, isAdmin], enabled: canSee, queryFn: async () => {
    const { data, error } = await supabase.rpc("can_correct_appointment_payment");
    if (error) throw error;
    return data;
  } });
  const [tab, setTab] = useState<Tab>("geral");
  const [period, setPeriod] = useState<PeriodKey>("hoje");
  const [custom, setCustom] = useState({ from: todaySP(), to: todaySP() });
  const range = periodRange(period, custom);

  const barbers = useQuery({
    queryKey: ["fin-barbers", ownBarberId], enabled: canSee,
    queryFn: async () => ((await supabase.from("barbers").select("id, name, team_role, commission_plan_pct").order("sort_order")).data ?? []) as Barber[],
  });
  const methods = useQuery({
    queryKey: ["fin-methods"], enabled: canSee,
    queryFn: async () => ((await supabase.from("payment_methods").select("*").order("sort_order")).data ?? []) as PaymentMethod[],
  });
  const settings = useQuery({
    queryKey: ["fin-commission-settings"], enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("operation_settings").select("id, commission_service_pct, commission_product_pct, commission_plan_pct, leader_commission_service_pct").order("id").limit(1).maybeSingle();
      if (error) throw error;
      return data as (CommissionSettings & { id: number }) | null;
    },
  });
  const entries = useFinanceData(range, canSee);

  const ctx: Ctx = { entries: entries.data ?? [], barbers: barbers.data ?? [], methods: methods.data ?? [], range, period, setPeriod, settings: settings.data ?? null };

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Financeiro</h1>
        {accessQuery.isFetched && !canSee && <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito.</div>}
        {canSee && (
          <>
            {isAdmin && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className={`min-h-11 rounded-md border px-2 text-sm font-semibold ${tab === t.key ? "border-brand bg-secondary text-brand" : "border-input text-foreground/80"}`}>
                  {t.label}
                </button>
              ))}
            </div>}
            {!isAdmin && <p className="text-sm text-foreground/70">Meu relatório: somente os seus dados.</p>}
            {!isAdmin && correctionAccess.data && <div className="grid grid-cols-2 gap-2"><Button variant={tab === "geral" ? "default" : "outline"} onClick={() => setTab("geral")}>Meu relatório</Button><Button variant={tab === "cor" ? "default" : "outline"} onClick={() => setTab("cor")}>Corrigir pagamentos</Button></div>}

            {(tab !== "pag" || !isAdmin) && (
              <section className={`${card} space-y-3`}>
                <div className="grid grid-cols-3 gap-2">
                  {PERIODS.map((p) => (
                    <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
                      className={`min-h-10 rounded-md px-1 text-xs font-semibold ${period === p.key ? "bg-brand text-brand-foreground" : "bg-secondary text-foreground"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {period === "personalizado" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={input} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                    <input type="date" className={input} value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                  </div>
                )}
                <p className="text-sm text-foreground/70">
                  Período: {range.from === range.to ? formatDay(range.from) : `${formatDay(range.from)} a ${formatDay(range.to)}`}
                </p>
              </section>
            )}

            {entries.isLoading && tab !== "pag" && <p className="text-base text-foreground/70">Carregando...</p>}
            {!isAdmin && ownBarberId && tab !== "cor" && <ProfessionalReport {...ctx} fixedId={ownBarberId} />}
            {tab === "cor" && correctionAccess.data && <PaymentCorrections range={range} methods={ctx.methods} isAdmin={isAdmin} />}
            {isAdmin && tab === "geral" && <Overview {...ctx} />}
            {isAdmin && tab === "mov" && <Movements {...ctx} />}
            {isAdmin && tab === "com" && <Commissions {...ctx} />}
            {isAdmin && tab === "desp" && <Expenses {...ctx} />}
            {isAdmin && tab === "rel" && <Reports {...ctx} />}
            {isAdmin && tab === "pag" && <Methods {...ctx} />}
          </>
        )}
      </main>
    </div>
  );
}

type Ctx = {
  entries: Entry[]; barbers: Barber[]; methods: PaymentMethod[]; range: { from: string; to: string };
  period: PeriodKey; setPeriod: (p: PeriodKey) => void; settings: (CommissionSettings & { id: number }) | null;
};

function Stat({ title, value, tone }: { title: string; value: string; tone?: "gold" | "brand" | "neg" }) {
  return (
    <div className={`${card} min-w-0`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{title}</p>
      <p className={`mt-1 break-words font-display text-lg font-bold ${tone === "gold" ? "text-gold" : tone === "brand" ? "text-brand" : tone === "neg" ? "text-destructive" : "text-card-foreground"}`}>{value}</p>
    </div>
  );
}

function Bar({ label: l, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate text-foreground">{l}</span><span className="shrink-0 font-semibold">{brl(value)}</span></div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Row({ k, v, bold, tone }: { k: string; v: string; bold?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between gap-3 border-b border-border/70 text-sm last:border-0 ${bold ? "py-2.5" : "py-1.5"}`}>
      <span className={bold ? "font-bold" : "text-foreground/70"}>{k}</span>
      <span className={`text-right tabular-nums ${bold ? "font-bold" : "font-semibold"} ${tone ?? ""}`}>{v}</span>
    </div>
  );
}

function MethodsTable({ entries, methods }: { entries: Entry[]; methods: PaymentMethod[] }) {
  const s = summarize(entries);
  return (
    <div className="space-y-2">
      {methods.map((m) => {
        const v = s.byMethod[m.id];
        return (
          <div key={m.id} className="rounded-md border border-border p-2 text-sm">
            <p className="font-semibold">{m.label} <span className="font-normal text-foreground/60">({v?.count ?? 0})</span></p>
            <p className="text-foreground/70">Bruto {brl(v?.gross ?? 0)} · Desc. {brl(v?.discounts ?? 0)} · Taxa {brl(v?.fees ?? 0)} · <b className="text-foreground">Líquido {brl(v?.net ?? 0)}</b></p>
          </div>
        );
      })}
    </div>
  );
}

function ResultBlock({ entries, showCount }: { entries: Entry[]; showCount?: boolean }) {
  const s = summarize(entries);
  return (
    <div>
      {showCount && <>
        <Row k="Atendimentos" v={String(s.appointments)} />
        <Row k="Serviços realizados" v={String(s.serviceCount)} />
        <Row k="Produtos vendidos" v={String(s.productCount)} />
        <Row k="Planos vendidos" v={String(s.planCount)} />
      </>}
      <Row k="Faturamento bruto" v={brl(s.gross)} />
      <Row k="(−) Descontos" v={brl(s.discounts)} />
      <Row k="(−) Taxas de pagamento" v={brl(s.fees)} />
      <Row k="(=) Valor líquido" v={brl(s.net)} />
      <Row k="(−) Comissões" v={brl(s.commissions)} />
      <Row k="(−) Despesas" v={brl(s.expenses)} />
      <Row k="= Resultado operacional" v={brl(s.result)} bold tone={s.result < 0 ? "text-destructive" : "text-gold"} />
    </div>
  );
}

function BarberTotals({ entries, barbers }: { entries: Entry[]; barbers: Barber[] }) {
  const perf = barberPerf(entries, barbers);
  const adm = adminTotals(entries);
  const s = summarize(entries);
  return (
    <div className="space-y-1">
      {perf.map((p) => <Row key={p.id} k={p.name} v={brl(p.totals.gross)} />)}
      <Row k="Administrador (vendas sem barbeiro)" v={brl(adm.gross)} />
      <Row k="Faturamento geral" v={brl(s.gross)} bold />
    </div>
  );
}

function Summary({ entries, barbers, methods }: Ctx) {
  const s = summarize(entries);
  const maxCat = Math.max(s.services, s.products, s.plans);
  return (
    <>
      <section className={`${card} space-y-4`}>
        <div className="flex items-end justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/55">Resultado operacional</p>
            <p className={`mt-1 break-words font-display text-3xl font-bold ${s.result < 0 ? "text-destructive" : "text-brand"}`}>{brl(s.result)}</p>
          </div>
          <div className="shrink-0 text-right text-xs text-foreground/60">
            <p><b className="text-foreground">{s.appointments}</b> atendimentos</p>
            <p>{s.serviceCount} serv. · {s.productCount} prod. · {s.planCount} planos</p>
          </div>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold text-foreground/70">Demonstrativo</h2>
          <ResultBlock entries={entries} />
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento por tipo (valor pago)</h2>
        <Bar label="Serviços" value={s.services} max={maxCat} />
        <Bar label="Produtos" value={s.products} max={maxCat} />
        <Bar label="Planos" value={s.plans} max={maxCat} />
      </section>
      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Formas de pagamento</h2>
        <MethodsTable entries={entries} methods={methods} />
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento geral da barbearia</h2>
        <BarberTotals entries={entries} barbers={barbers} />
        <p className="text-xs text-foreground/60">Serviços contam para quem realizou; produtos e planos para quem vendeu.</p>
      </section>
    </>
  );
}

function DailyClosing({ barbers, methods }: Pick<Ctx, "barbers" | "methods">) {
  const [day, setDay] = useState(todaySP());
  const q = useFinanceData({ from: day, to: day }, true);
  const list = q.data ?? [];
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-card-foreground">Fechamento do dia</h2>
        <input type="date" className={`${input} w-auto`} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </div>
      <p className="text-sm text-foreground/70">{formatDay(day)}</p>
      {q.isLoading ? <p className="text-sm text-foreground/70">Carregando...</p> : (
        <>
          <ResultBlock entries={list} showCount />
          <h3 className="pt-2 text-sm font-bold">Formas de pagamento</h3>
          <MethodsTable entries={list} methods={methods} />
          <h3 className="pt-2 text-sm font-bold">Faturamento por barbeiro</h3>
          <BarberTotals entries={list} barbers={barbers} />
        </>
      )}
    </section>
  );
}

function Overview(ctx: Ctx) {
  const [selected, setSelected] = useState("");
  const perf = barberPerf(ctx.entries, ctx.barbers);
  const sel = perf.find((p) => p.id === selected);
  return (
    <div className="space-y-4">
      <Summary {...ctx} />
      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento por barbeiro</h2>
        {perf.length === 0 && <p className="text-sm text-foreground/70">Sem movimentações de barbeiros no período.</p>}
        <select className={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Todos os barbeiros</option>
          {perf.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="grid gap-3">
          {(sel ? [sel] : perf).map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3">
              <p className="font-bold text-card-foreground">{p.name}</p>
              <p className="text-xs text-foreground/60">{p.appointments} atendimento(s) · {p.services} serviço(s) · {p.products} produto(s) · {p.plans} plano(s)</p>
              <div className="mt-2">
                <Row k="Faturamento bruto" v={brl(p.totals.gross)} />
                <Row k="Descontos" v={brl(p.totals.discounts)} />
                <Row k="Taxas" v={brl(p.totals.fees)} />
                <Row k="Valor líquido" v={brl(p.totals.net)} />
                <Row k="Comissão" v={brl(p.commission)} />
                <Row k="Comissão pendente" v={brl(p.pending)} tone="text-gold" />
                <Row k="Comissão paga" v={brl(p.paid)} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <DailyClosing barbers={ctx.barbers} methods={ctx.methods} />
    </div>
  );
}

function EntryRow({ e, barbers, methods, children }: { e: Entry; barbers: Barber[]; methods: PaymentMethod[]; children?: ReactNode }) {
  const name = (id: string | null) => barbers.find((b) => b.id === id)?.name;
  const when = new Date(e.occurred_at);
  const cat = e.kind === "entrada" ? INCOME_CATEGORIES[e.category] ?? e.category : e.category;
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold text-card-foreground">{e.description || cat}</p>
          <p className="text-xs text-foreground/60">
            {when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · {cat}
            {e.payment_method && ` · ${methods.find((m) => m.id === e.payment_method)?.label ?? e.payment_method}`}
          </p>
          {e.client_name && <p className="text-xs text-foreground/60">Cliente: {e.client_name}</p>}
          {name(e.barber_id) && <p className="text-xs text-foreground/60">Realizado por: {name(e.barber_id)}</p>}
          {e.kind === "entrada" && e.category !== "servico" && <p className="text-xs text-foreground/60">Vendido por: {name(e.seller_barber_id) ?? "Administrador"}</p>}
          {e.appointment_id && <p className="text-xs text-foreground/60">Ligado a um agendamento</p>}
          {e.note && <p className="break-words text-xs text-foreground/60">{e.note}</p>}
          {e.refunded_at && (
            <p className="mt-1 inline-block rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] font-bold uppercase text-destructive">
              Estornado em {new Date(e.refunded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · fora dos totais
            </p>
          )}
        </div>
        <p className={`shrink-0 font-bold ${e.kind === "entrada" ? "text-brand" : "text-destructive"}`}>{e.kind === "entrada" ? "+" : "−"}{brl(e.kind === "entrada" ? paid(e) : e.amount_cents)}</p>
      </div>
      {e.kind === "entrada" && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-foreground/70 sm:grid-cols-3">
          <div>Original: <b>{brl(e.amount_cents)}</b></div>
          <div>Desconto: <b>{brl(e.discount_cents)}</b></div>
          <div>Pago: <b>{brl(paid(e))}</b></div>
          <div>Taxa ({pct(e.fee_percent)}): <b>{brl(e.fee_cents)}</b></div>
          <div>Líquido: <b>{brl(net(e))}</b></div>
          {e.commission_barber_id
            ? <div>Comissão ({pct(e.commission_percent)}): <b>{brl(e.commission_cents)}</b></div>
            : <div>Sem comissão · líquido da barbearia</div>}
        </dl>
      )}
      {children}
    </div>
  );
}

function Movements({ entries, barbers, methods, settings }: Ctx) {
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: "", category: "", barber: "", seller: "", method: "" });
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"atend" | "lanc">("atend");
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  async function refund(id: string) {
    const { error } = await supabase.rpc("refund_product_sale", { _entry_id: id, _note: "" });
    setConfirmRefund(null);
    if (error) return setRefundErr(error.message || "Não foi possível estornar.");
    qc.invalidateQueries({ queryKey: ["fin-entries"] });
  }
  const list = entries.filter((e) =>
    (!f.kind || e.kind === f.kind) && (!f.category || e.category === f.category) &&
    (!f.barber || e.barber_id === f.barber) && (!f.method || e.payment_method === f.method) &&
    (!f.seller || (f.seller === "admin" ? e.kind === "entrada" && e.category !== "servico" && !e.seller_barber_id : e.seller_barber_id === f.seller)));
  const totalIn = list.filter((e) => e.kind === "entrada" && isCounted(e)).reduce((s, e) => s + paid(e), 0);
  const totalOut = list.filter((e) => e.kind === "saida").reduce((s, e) => s + e.amount_cents, 0);
  const cats = [...Object.entries(INCOME_CATEGORIES), ...EXPENSE_CATEGORIES.map((c) => [c, c] as const)];
  return (
    <div className="space-y-4">
      <button type="button" className={`${btn} w-full`} onClick={() => setAdding(!adding)}>+ Registrar venda de produto ou plano</button>
      {adding && <SaleForm barbers={barbers} methods={methods} settings={settings} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["fin-entries"] }); }} />}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={view === "atend" ? btn : btnGhost} onClick={() => setView("atend")}>Atendimentos</button>
        <button type="button" className={view === "lanc" ? btn : btnGhost} onClick={() => setView("lanc")}>Todos os lançamentos</button>
      </div>
      {view === "atend" ? <Attendances entries={entries} barbers={barbers} methods={methods} /> : <>
      <section className={`${card} grid gap-2 sm:grid-cols-2`}>
        <select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Entradas e saídas</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
        <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Todas as categorias</option>{cats.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={input} value={f.barber} onChange={(e) => setF({ ...f, barber: e.target.value })}><option value="">Qualquer barbeiro</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={input} value={f.seller} onChange={(e) => setF({ ...f, seller: e.target.value })}><option value="">Qualquer responsável pela venda</option><option value="admin">Administrador</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={input} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">Qualquer forma de pagamento</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
      </section>
      <div className="grid grid-cols-3 gap-2">
        <Stat title="Entradas" value={brl(totalIn)} tone="brand" />
        <Stat title="Saídas" value={brl(totalOut)} />
        <Stat title="Saldo" value={brl(totalIn - totalOut)} tone="gold" />
      </div>
      {list.length === 0 && <p className="text-base text-foreground/70">Nenhuma movimentação.</p>}
      {refundErr && <p className="text-sm font-semibold text-destructive">{refundErr}</p>}
      <div className="grid gap-3">{list.map((e) => (
        <EntryRow key={e.id} e={e} barbers={barbers} methods={methods}>
          {e.product_id && !e.refunded_at && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {confirmRefund === e.id ? (
                <>
                  <button type="button" className={`${btnGhost} text-destructive`} onClick={() => refund(e.id)}>Sim, estornar e devolver ao estoque</button>
                  <button type="button" className={btnGhost} onClick={() => setConfirmRefund(null)}>Não</button>
                </>
              ) : (
                <button type="button" className={`${btnGhost} text-destructive`} onClick={() => { setRefundErr(null); setConfirmRefund(e.id); }}>Estornar venda</button>
              )}
            </div>
          )}
        </EntryRow>
      ))}</div>
      </>}
    </div>
  );
}

function Attendances({ entries, barbers, methods }: { entries: Entry[]; barbers: Barber[]; methods: PaymentMethod[] }) {
  const list = groupAttendances(entries);
  const s = summarize(entries);
  const bname = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? "—";
  const mLabel = (id: string | null) => methods.find((m) => m.id === id)?.label ?? id ?? "—";
  const solo = entries.filter((e) => e.kind === "entrada" && !e.appointment_id && e.category !== "servico");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat title="Atendimentos" value={String(s.appointments)} tone="brand" />
        <Stat title="Serviços" value={String(s.serviceCount)} />
        <Stat title="Produtos" value={String(s.productCount)} />
        <Stat title="Vendas avulsas" value={String(solo.length)} />
      </div>
      {list.length === 0 && <p className="text-base text-foreground/70">Nenhum atendimento no período.</p>}
      {list.map((a: Attendance) => {
        const allRefunded = a.entries.every((e) => e.refunded_at);
        return (
          <div key={a.key} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-bold text-card-foreground">{a.client || "Cliente"}</p>
                <p className="text-xs text-foreground/60">{new Date(a.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · Barbeiro: {bname(a.barberId)} · {mLabel(a.method)}</p>
              </div>
              <p className="shrink-0 font-bold text-brand">{brl(a.paid)}</p>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/60">Serviços</p>
                {a.services.length === 0 && <p className="text-sm text-foreground/60">—</p>}
                {a.services.map((i, n) => (
                  <p key={n} className="text-sm">• {i.qty > 1 ? `${i.qty}x ` : ""}{i.name} <span className={i.added ? "text-gold" : "text-foreground/60"}>— {i.added ? "adicional" : "agendado"}</span></p>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/60">Produtos</p>
                {a.products.length === 0 && <p className="text-sm text-foreground/60">—</p>}
                {a.products.map((p) => (
                  <p key={p.entry.id} className={`text-sm ${p.entry.refunded_at ? "line-through text-foreground/50" : ""}`}>• {p.name} — {p.qty} unidade{p.qty > 1 ? "s" : ""}{p.entry.refunded_at ? " (estornado)" : ""}</p>
                ))}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 border-t border-border pt-2 text-xs text-foreground/70 sm:grid-cols-4">
              <div>Serviços: <b>{brl(a.servicesPaid)}</b></div>
              <div>Produtos: <b>{brl(a.productsPaid)}</b></div>
              <div>Desconto: <b>{brl(a.discounts)}</b></div>
              <div>Total pago: <b>{brl(a.paid)}</b></div>
              <div>Taxa: <b>{brl(a.fees)}</b></div>
              <div>Comissão: <b>{brl(a.commission)}</b></div>
              <div>Valor líquido: <b>{brl(a.net)}</b></div>
              <div>Atendimento: <b>1</b></div>
            </dl>
            {allRefunded && <p className="mt-1 text-xs font-bold text-destructive">Estornado · fora dos totais</p>}
          </div>
        );
      })}
      {solo.length > 0 && (
        <section className={`${card} space-y-1`}>
          <h3 className="text-sm font-bold">Vendas sem atendimento</h3>
          {solo.map((e) => (
            <Row key={e.id} k={`${e.category === "produto" ? "Venda de produto" : "Venda de plano"} · ${e.description}${e.client_name ? ` · ${e.client_name}` : ""}${e.refunded_at ? " (estornado)" : ""}`} v={brl(paid(e))} />
          ))}
        </section>
      )}
    </div>
  );
}

function SaleForm({ barbers, methods, settings, onDone }: { barbers: Barber[]; methods: PaymentMethod[]; settings: Ctx["settings"]; onDone: () => void }) {
  const [v, setV] = useState({ category: "produto", description: "", amount: "", discount: "", method: "pix", client: "", seller: "", date: todaySP(), note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = toCents(v.amount);
  // Prévia apenas; o valor oficial é calculado e gravado pelo banco.
  const feePct = Number(methods.find((m) => m.id === v.method)?.fee_percent ?? 0);
  const paidV = Math.max(amount - toCents(v.discount), 0);
  const feeV = Math.round((paidV * feePct) / 100);
  const sellerB = barbers.find((b) => b.id === v.seller);
  const earns = !!sellerB && (sellerB.team_role === "barbeiro" || sellerB.team_role === "lider");
  const commPct = !earns ? 0 : Number(v.category === "produto" ? settings?.commission_product_pct ?? 30 : sellerB?.commission_plan_pct ?? settings?.commission_plan_pct ?? 50);
  const commission = sellerB?.team_role === "lider"
    ? Math.max(Math.round((paidV * commPct) / 100) - feeV, 0)
    : Math.round(((paidV - feeV) * commPct) / 100);
  async function save() {
    setErr(null);
    if (!v.description.trim() || amount <= 0) return setErr("Informe descrição e valor.");
    if (toCents(v.discount) > amount || toCents(v.discount) < 0) return setErr("Desconto inválido.");
    setSaving(true);
    const { error } = await supabase.from("financial_entries").insert({
      kind: "entrada", category: v.category, description: v.description.trim(), amount_cents: amount,
      discount_cents: toCents(v.discount), payment_method: v.method, client_name: v.client.trim(),
      seller_barber_id: v.seller || null, note: v.note.trim(),
      occurred_at: v.date === todaySP() ? new Date().toISOString() : new Date(`${v.date}T12:00:00-03:00`).toISOString(),
    });
    setSaving(false);
    if (error) return setErr("Não foi possível salvar.");
    onDone();
  }
  return (
    <section className={`${card} space-y-3`}>
      <div className="grid grid-cols-2 gap-2">
        {(["produto", "plano"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setV({ ...v, category: c })}
            className={`min-h-12 rounded-md border text-sm font-semibold ${v.category === c ? "border-brand bg-secondary text-brand" : "border-input"}`}>{INCOME_CATEGORIES[c]}</button>
        ))}
      </div>
      <label className={label}><span>Descrição</span><input className={input} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}><span>Valor (R$)</span><input inputMode="decimal" className={input} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></label>
        <label className={label}><span>Desconto (R$)</span><input inputMode="decimal" className={input} value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}><span>Forma de pagamento</span><select className={input} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{methods.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className={label}><span>Data</span><input type="date" className={input} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
      </div>
      <label className={label}><span>Cliente</span><input className={input} value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} /></label>
      <label className={label}><span>Quem vendeu</span><select className={input} value={v.seller} onChange={(e) => setV({ ...v, seller: e.target.value })}><option value="">Administrador</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className={label}><span>Observação</span><input className={input} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      <p className="text-sm text-foreground/70">Pago {brl(paidV)} · Taxa {brl(feeV)} ({pct(feePct)}) · Líquido {brl(paidV - feeV)}<br />Comissão: <b>{brl(commission)}</b> {earns ? `(${pct(commPct)} do líquido, prévia)` : "(sem comissão · 100% para a barbearia)"}</p>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      <button type="button" disabled={saving} onClick={save} className={`${btn} w-full`}>{saving ? "Salvando..." : "Salvar venda"}</button>
    </section>
  );
}

function Commissions({ entries, barbers, methods }: Ctx) {
  const qc = useQueryClient();
  const [barber, setBarber] = useState("");
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const list = entries.filter((e) => e.commission_cents > 0 && (!barber || e.commission_barber_id === barber) && (!status || e.commission_status === status));
  const perf = barberPerf(entries, barbers).filter((p) => p.commission > 0 && (!barber || p.id === barber));
  async function mark(ids: string[], st: "paga" | "pendente") {
    if (ids.length === 0) return;
    setMsg(null);
    const { error } = await supabase.from("financial_entries").update({ commission_status: st, commission_paid_at: st === "paga" ? new Date().toISOString() : null }).in("id", ids);
    if (error) setMsg("Não foi possível atualizar a comissão.");
    qc.invalidateQueries({ queryKey: ["fin-entries"] });
  }
  const name = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? "—";
  const comm = (l: Entry[], c: string) => l.filter((e) => e.category === c);
  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-2 sm:grid-cols-2`}>
        <select className={input} value={barber} onChange={(e) => setBarber(e.target.value)}><option value="">Todos os barbeiros</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="pendente">Pendentes</option><option value="paga">Pagas</option></select>
      </section>
      <p className="text-xs text-foreground/60">A comissão é calculada sobre o valor líquido (valor pago − taxa da forma de pagamento), com o percentual gravado em cada lançamento. Plano vendido pelo administrador: 100% para a barbearia.</p>
      {perf.map((p) => {
        const mine = entries.filter((e) => e.commission_barber_id === p.id && e.commission_cents > 0);
        const gross = mine.reduce((s, e) => s + e.amount_cents, 0);
        const disc = mine.reduce((s, e) => s + e.discount_cents, 0);
        const fees = mine.reduce((s, e) => s + e.fee_cents, 0);
        return (
          <section key={p.id} className={`${card} space-y-1`}>
            <h2 className="text-base font-bold text-card-foreground">{p.name}</h2>
            <p className="text-xs text-foreground/60">
              Serviços: {comm(mine, "servico").length} · Produtos: {comm(mine, "produto").length} · Planos: {comm(mine, "plano").length}
            </p>
            <Row k="Valor bruto" v={brl(gross)} />
            <Row k="Descontos" v={brl(disc)} />
            <Row k="Taxas" v={brl(fees)} />
            <Row k="Base líquida" v={brl(p.commissionBase)} />
            <Row k="Percentual" v={[...new Set(mine.map((e) => pct(e.commission_percent)))].join(" / ")} />
            <Row k="Comissão gerada" v={brl(p.commission)} bold />
            <Row k="Pendente" v={brl(p.pending)} tone="text-gold" />
            <Row k="Paga" v={brl(p.paid)} />
            {p.pending > 0 && (
              <button type="button" className={`${btn} mt-2 w-full`} onClick={() => mark(mine.filter((e) => e.commission_status === "pendente").map((e) => e.id), "paga")}>
                Marcar pendentes de {p.name} como pagas
              </button>
            )}
          </section>
        );
      })}
      {msg && <p className="text-sm font-semibold text-destructive">{msg}</p>}
      {list.length === 0 && <p className="text-base text-foreground/70">Nenhuma comissão no período.</p>}
      <div className="grid gap-3">
        {list.map((e) => (
          <EntryRow key={e.id} e={e} barbers={barbers} methods={methods}>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-sm">{name(e.commission_barber_id)}: <b>{brl(e.commission_cents)}</b>{" "}
                {e.commission_status === "paga"
                  ? <span className="text-brand">· Paga em {new Date(e.commission_paid_at!).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                  : <span className="text-gold">· Pendente</span>}
              </p>
              <button type="button" className={btnGhost} onClick={() => mark([e.id], e.commission_status === "paga" ? "pendente" : "paga")}>
                {e.commission_status === "paga" ? "Voltar para pendente" : "Marcar como paga"}
              </button>
            </div>
          </EntryRow>
        ))}
      </div>
    </div>
  );
}

function Expenses({ entries, barbers, methods }: Ctx) {
  const qc = useQueryClient();
  const empty = { id: "", description: "", category: "Aluguel", amount: "", date: todaySP(), method: "pix", note: "" };
  const [form, setForm] = useState<typeof empty | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const list = entries.filter((e) => e.kind === "saida");
  const total = list.reduce((s, e) => s + e.amount_cents, 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin-entries"] });
  async function save() {
    if (!form) return;
    setErr(null);
    const amount = toCents(form.amount);
    if (!form.description.trim() || amount <= 0) return setErr("Informe descrição e valor.");
    const row = {
      kind: "saida", category: form.category, description: form.description.trim(), amount_cents: amount,
      payment_method: form.method, note: form.note.trim(), occurred_at: new Date(`${form.date}T12:00:00-03:00`).toISOString(),
    };
    const { error } = form.id
      ? await supabase.from("financial_entries").update(row).eq("id", form.id)
      : await supabase.from("financial_entries").insert(row);
    if (error) return setErr("Não foi possível salvar.");
    setForm(null);
    refresh();
  }
  async function del(id: string) {
    await supabase.from("financial_entries").delete().eq("id", id);
    setConfirmDel(null);
    refresh();
  }
  return (
    <div className="space-y-4">
      <button type="button" className={`${btn} w-full`} onClick={() => setForm(form ? null : empty)}>+ Registrar despesa</button>
      {form && (
        <section className={`${card} space-y-3`}>
          <label className={label}><span>Descrição</span><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}><span>Categoria</span><select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className={label}><span>Valor (R$)</span><input inputMode="decimal" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className={label}><span>Data</span><input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className={label}><span>Pagamento</span><select className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
          </div>
          <label className={label}><span>Observação</span><input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
          <button type="button" className={`${btn} w-full`} onClick={save}>{form.id ? "Salvar alterações" : "Salvar despesa"}</button>
        </section>
      )}
      <Stat title="Total de despesas no período" value={brl(total)} />
      {list.length === 0 && <p className="text-base text-foreground/70">Nenhuma despesa no período.</p>}
      <div className="grid gap-3">
        {list.map((e) => (
          <EntryRow key={e.id} e={e} barbers={barbers} methods={methods}>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <button type="button" className={btnGhost} onClick={() => setForm({
                id: e.id, description: e.description, category: e.category, amount: (e.amount_cents / 100).toFixed(2).replace(".", ","),
                date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(e.occurred_at)),
                method: e.payment_method ?? "pix", note: e.note,
              })}>Editar</button>
              {confirmDel === e.id ? (
                <>
                  <button type="button" className={`${btnGhost} text-destructive`} onClick={() => del(e.id)}>Sim, excluir</button>
                  <button type="button" className={btnGhost} onClick={() => setConfirmDel(null)}>Não</button>
                </>
              ) : (
                <button type="button" className={`${btnGhost} text-destructive`} onClick={() => setConfirmDel(e.id)}>Excluir</button>
              )}
            </div>
          </EntryRow>
        ))}
      </div>
    </div>
  );
}

const REPORT_KINDS: { key: ReportKind; label: string; period: PeriodKey }[] = [
  { key: "diario", label: "Diário", period: "hoje" },
  { key: "semanal", label: "Semanal", period: "semana" },
  { key: "mensal", label: "Mensal", period: "mes" },
  { key: "personalizado", label: "Personalizado", period: "personalizado" },
];

function Reports(ctx: Ctx) {
  const [mode, setMode] = useState<"geral" | "prof">("geral");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {([["geral", "Relatório Geral"], ["prof", "Relatório por profissional"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={`min-h-12 rounded-md border px-2 text-sm font-bold ${mode === k ? "border-brand bg-secondary text-brand" : "border-input text-foreground/80"}`}>{l}</button>
        ))}
      </div>
      {mode === "geral" ? <GeneralReport {...ctx} /> : <ProfessionalReport {...ctx} />}
    </div>
  );
}

function ProfessionalReport(ctx: Ctx & { fixedId?: string }) {
  const pros = ctx.barbers.filter((b) => ctx.fixedId ? b.id === ctx.fixedId : (b.team_role === "barbeiro" || b.team_role === "lider"));
  const [sel, setSel] = useState("");
  const barber = pros.find((b) => b.id === (ctx.fixedId ?? sel));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const r = barber ? professionalReport(ctx.entries, barber.id) : null;
  async function pdf() {
    if (!barber) return;
    setBusy(true); setErr(null);
    try { await generateProfessionalPdf({ range: ctx.range, entries: ctx.entries, barber, methods: ctx.methods }); }
    catch { setErr("Não foi possível gerar o PDF."); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      {!ctx.fixedId && (
        <section className={`${card} space-y-2`}>
          <label className={label}><span>Profissional</span>
            <select className={input} value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Selecione</option>
              {pros.map((b) => <option key={b.id} value={b.id}>{b.name} · {TEAM_ROLE_LABEL[b.team_role ?? ""] ?? "Barbeiro"}</option>)}
            </select>
          </label>
          {pros.length === 0 && <p className="text-sm text-foreground/70">Nenhum barbeiro ou líder cadastrado.</p>}
        </section>
      )}
      {barber && r && (
        <>
          <section className={`${card} space-y-1`}>
            <h2 className="text-base font-bold text-card-foreground">{barber.name} · {TEAM_ROLE_LABEL[barber.team_role ?? ""] ?? "Barbeiro"}</h2>
            <Row k="Atendimentos" v={String(r.appointments)} />
            <Row k={`Serviços realizados (${r.services})`} v={brl(r.servicesPaid)} />
            <Row k={`Produtos vendidos (${r.products})`} v={brl(r.productsPaid)} />
            <Row k={`Planos vendidos (${r.plans})`} v={brl(r.plansPaid)} />
            <Row k="Receita gerada (valor pago)" v={brl(r.revenue)} bold />
            <Row k="Taxas de pagamento relacionadas" v={`−${brl(r.fees)}`} />
            <Row k="Valor líquido" v={brl(r.net)} />
          </section>
          <section className={`${card} space-y-1`}>
            <h2 className="text-base font-bold text-card-foreground">Comissões</h2>
            <Row k="Comissão de serviços" v={brl(r.commService)} />
            <Row k="Comissão de produtos" v={brl(r.commProduct)} />
            <Row k="Comissão de planos" v={brl(r.commPlan)} />
            <Row k="Já paga" v={brl(r.paidOut)} />
            <Row k="Pendente" v={brl(r.pending)} />
            <Row k="Total de comissão a receber" v={brl(r.commission)} bold />
          </section>
          {!ctx.fixedId && <button type="button" disabled={busy} onClick={pdf} className={`${btn} w-full`}>{busy ? "Gerando..." : "Gerar PDF"}</button>}
          {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
        </>
      )}
    </div>
  );
}

function GeneralReport(ctx: Ctx) {
  const kind: ReportKind =
    ctx.period === "hoje" || ctx.period === "ontem" ? "diario"
    : ctx.period === "semana" ? "semanal"
    : ctx.period === "mes" || ctx.period === "mes_anterior" ? "mensal" : "personalizado";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = summarize(ctx.entries);
  async function pdf() {
    setBusy(true); setErr(null);
    try { await generateFinancePdf({ kind, range: ctx.range, entries: ctx.entries, barbers: ctx.barbers, methods: ctx.methods }); }
    catch { setErr("Não foi possível gerar o PDF."); }
    setBusy(false);
  }
  const perf = barberPerf(ctx.entries, ctx.barbers);
  const list = (o: Record<string, { count: number; paid: number }>) => Object.entries(o);
  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Tipo de relatório</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REPORT_KINDS.map((r) => (
            <button key={r.key} type="button" onClick={() => ctx.setPeriod(r.period)}
              className={`min-h-11 rounded-md border px-2 text-sm font-semibold ${kind === r.key ? "border-brand bg-secondary text-brand" : "border-input text-foreground/80"}`}>{r.label}</button>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={pdf} className={`${btn} w-full`}>{busy ? "Gerando..." : "Gerar PDF"}</button>
        {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      </section>
      <section className={`${card} space-y-1`}>
        <h2 className="text-base font-bold text-card-foreground">Resumo</h2>
        <ResultBlock entries={ctx.entries} showCount={kind === "diario"} />
      </section>
      <section className={`${card} space-y-1`}>
        <h2 className="text-base font-bold text-card-foreground">Comissões por perfil</h2>
        {(["barbeiro", "lider"] as const).map((r) => (
          <Row key={r} k={r === "lider" ? "Comissões de líderes" : "Comissões de barbeiros"}
            v={brl(ctx.entries.filter((e) => isCounted(e) && e.commission_barber_id && ctx.barbers.find((b) => b.id === e.commission_barber_id)?.team_role === r).reduce((t, e) => t + e.commission_cents, 0))} />
        ))}
      </section>
      <section className={`${card} space-y-2`}>
        <h2 className="text-base font-bold text-card-foreground">Formas de pagamento</h2>
        <MethodsTable entries={ctx.entries} methods={ctx.methods} />
      </section>
      <section className={`${card} space-y-1`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento por barbeiro</h2>
        <BarberTotals entries={ctx.entries} barbers={ctx.barbers} />
      </section>
      {[["Serviços", s.byService], ["Produtos", s.byProduct], ["Planos", s.byPlan]].map(([t, o]) => {
        const rows = list(o as Record<string, { count: number; paid: number }>);
        return rows.length > 0 && (
          <section key={t as string} className={`${card} space-y-1`}>
            <h2 className="text-base font-bold text-card-foreground">{t as string}</h2>
            {rows.map(([k, a]) => <Row key={k} k={`${k} (${a.count})`} v={brl(a.paid)} />)}
          </section>
        );
      })}
      {Object.keys(s.byExpense).length > 0 && (
        <section className={`${card} space-y-1`}>
          <h2 className="text-base font-bold text-card-foreground">Despesas</h2>
          {Object.entries(s.byExpense).map(([k, v]) => <Row key={k} k={k} v={brl(v)} />)}
        </section>
      )}
      {perf.some((p) => p.commission > 0) && (
        <section className={`${card} space-y-1`}>
          <h2 className="text-base font-bold text-card-foreground">Comissões</h2>
          {perf.filter((p) => p.commission > 0).map((p) => <Row key={p.id} k={p.name} v={brl(p.commission)} />)}
        </section>
      )}
    </div>
  );
}

function Methods({ methods, entries, settings }: Ctx) {
  const qc = useQueryClient();
  const [fees, setFees] = useState<Record<string, string>>({});
  const [comm, setComm] = useState<Partial<Record<keyof CommissionSettings, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const s = summarize(entries);
  const parse = (v: string) => { const n = Number(v.trim().replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };
  const show = (n: number) => String(n).replace(".", ",");

  async function saveAll() {
    setMsg(null);
    const feeUpdates: { id: string; fee_percent: number }[] = [];
    for (const m of methods) {
      const raw = fees[m.id];
      if (raw === undefined) continue;
      const n = parse(raw);
      if (n === null) return setMsg({ ok: false, text: `Taxa inválida em ${m.label}. Use um valor entre 0 e 100.` });
      feeUpdates.push({ id: m.id, fee_percent: n });
    }
    const commPatch: Partial<CommissionSettings> = {};
    for (const [k, raw] of Object.entries(comm) as [keyof CommissionSettings, string][]) {
      const n = parse(raw);
      if (n === null) return setMsg({ ok: false, text: "Percentual de comissão inválido. Use um valor entre 0 e 100." });
      commPatch[k] = n;
    }
    setSaving(true);
    try {
      for (const u of feeUpdates) {
        const { data, error } = await supabase.from("payment_methods").update({ fee_percent: u.fee_percent }).eq("id", u.id).select("id");
        if (error || !data?.length) throw new Error();
      }
      if (Object.keys(commPatch).length) {
        if (!settings) throw new Error();
        const { data, error } = await supabase.from("operation_settings").update(commPatch).eq("id", settings.id).select("id");
        if (error || !data?.length) throw new Error();
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["fin-methods"] }), qc.invalidateQueries({ queryKey: ["fin-commission-settings"] })]);
      setFees({}); setComm({});
      setMsg({ ok: true, text: "Configurações salvas com sucesso." });
    } catch {
      setMsg({ ok: false, text: "Não foi possível salvar as configurações." });
    }
    setSaving(false);
  }

  async function toggle(m: PaymentMethod) {
    const { error } = await supabase.from("payment_methods").update({ active: !m.active }).eq("id", m.id);
    if (error) setMsg({ ok: false, text: "Não foi possível salvar as configurações." });
    qc.invalidateQueries({ queryKey: ["fin-methods"] });
  }

  const commFields: { key: keyof CommissionSettings; label: string }[] = [
    { key: "commission_service_pct", label: "Serviços — Barbeiro (taxa dividida na proporção)" },
    { key: "leader_commission_service_pct", label: "Serviços — Líder/Gerente (assume 100% da taxa)" },
    { key: "commission_product_pct", label: "Produtos" },
    { key: "commission_plan_pct", label: "Plano vendido pelo barbeiro" },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/70">As taxas e comissões valem para os novos lançamentos. Lançamentos já registrados mantêm os percentuais da época. Valores abaixo referem-se ao período selecionado nas outras abas.</p>
      {methods.map((m) => {
        const v = s.byMethod[m.id];
        return (
          <div key={m.id} className={`${card} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-card-foreground">{m.label}</p>
              <button type="button" className={btnGhost} onClick={() => toggle(m)}>{m.active ? "Desativar" : "Ativar"}</button>
            </div>
            {!m.active && <p className="text-xs font-semibold uppercase text-foreground/50">Desativada</p>}
            <label className={label}><span>Taxa (%)</span>
              <input inputMode="decimal" className={input} value={fees[m.id] ?? show(m.fee_percent)} onChange={(e) => setFees({ ...fees, [m.id]: e.target.value })} />
            </label>
            <p className="text-sm text-foreground/70">{v?.count ?? 0} lanç. · Bruto {brl(v?.gross ?? 0)} · Desc. {brl(v?.discounts ?? 0)} · Taxa {brl(v?.fees ?? 0)} · <b className="text-foreground">Líquido {brl(v?.net ?? 0)}</b></p>
          </div>
        );
      })}
      <div className={`${card} space-y-3`}>
        <p className="font-bold text-card-foreground">Comissões (% sobre o valor líquido)</p>
        {commFields.map((f) => (
          <label key={f.key} className={label}><span>{f.label}</span>
            <input inputMode="decimal" className={input} value={comm[f.key] ?? show(Number(settings?.[f.key] ?? 0))} onChange={(e) => setComm({ ...comm, [f.key]: e.target.value })} />
          </label>
        ))}
        <p className="text-xs text-foreground/60">Plano ou produto vendido pelo administrador: 100% para a barbearia.</p>
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-brand" : "text-destructive"}`}>{msg.text}</p>}
      <button type="button" disabled={saving} className={`${btn} w-full`} onClick={saveAll}>{saving ? "Salvando..." : "Salvar"}</button>
    </div>
  );
}
