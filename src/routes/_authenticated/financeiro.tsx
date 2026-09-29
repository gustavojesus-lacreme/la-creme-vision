import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, PERIODS, brl, periodRange, rangeToIso, summarize, toCents,
  type Entry, type PaymentMethod, type PeriodKey,
} from "@/lib/finance";
import { todaySP, formatDay } from "@/lib/absences";

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
  { key: "com", label: "Comissões" },
  { key: "desp", label: "Despesas" },
  { key: "rel", label: "Relatórios" },
  { key: "pag", label: "Formas de pagamento" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const card = "rounded-lg border border-border bg-card p-4";
const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const label = "block min-w-0 space-y-1 text-sm font-semibold text-foreground";
const btn = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnGhost = "min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground";

type Barber = { id: string; name: string };

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
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;
  const [tab, setTab] = useState<Tab>("geral");
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [custom, setCustom] = useState({ from: todaySP(), to: todaySP() });
  const range = periodRange(period, custom);

  const barbers = useQuery({
    queryKey: ["fin-barbers"], enabled: isAdmin,
    queryFn: async () => ((await supabase.from("barbers").select("id, name").order("sort_order")).data ?? []) as Barber[],
  });
  const methods = useQuery({
    queryKey: ["fin-methods"], enabled: isAdmin,
    queryFn: async () => ((await supabase.from("payment_methods").select("*").order("sort_order")).data ?? []) as PaymentMethod[],
  });
  const entries = useFinanceData(range, isAdmin);

  const ctx = { entries: entries.data ?? [], barbers: barbers.data ?? [], methods: methods.data ?? [], range };

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Financeiro</h1>
        {adminQuery.data === false && <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito ao administrador.</div>}
        {isAdmin && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className={`min-h-11 rounded-md border px-2 text-sm font-semibold ${tab === t.key ? "border-brand bg-secondary text-brand" : "border-input text-foreground/80"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab !== "pag" && (
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
            {tab === "geral" && <Overview {...ctx} />}
            {tab === "mov" && <Movements {...ctx} />}
            {tab === "com" && <Commissions {...ctx} />}
            {tab === "desp" && <Expenses {...ctx} />}
            {tab === "rel" && <Reports {...ctx} />}
            {tab === "pag" && <Methods {...ctx} />}
          </>
        )}
      </main>
    </div>
  );
}

type Ctx = { entries: Entry[]; barbers: Barber[]; methods: PaymentMethod[]; range: { from: string; to: string } };

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

function barberPerf(entries: Entry[], barbers: Barber[]) {
  return barbers.map((b) => {
    const performed = entries.filter((e) => e.kind === "entrada" && e.category === "servico" && e.barber_id === b.id);
    const sold = (c: string) => entries.filter((e) => e.kind === "entrada" && e.category === c && e.seller_barber_id === b.id);
    const comm = entries.filter((e) => e.commission_barber_id === b.id);
    return {
      ...b,
      services: performed.length,
      revenue: performed.reduce((s, e) => s + e.amount_cents - e.discount_cents, 0),
      products: sold("produto").length,
      productsValue: sold("produto").reduce((s, e) => s + e.amount_cents - e.discount_cents, 0),
      plans: sold("plano").length,
      plansValue: sold("plano").reduce((s, e) => s + e.amount_cents - e.discount_cents, 0),
      commission: comm.reduce((s, e) => s + e.commission_cents, 0),
      pending: comm.filter((e) => e.commission_status === "pendente").reduce((s, e) => s + e.commission_cents, 0),
      paid: comm.filter((e) => e.commission_status === "paga").reduce((s, e) => s + e.commission_cents, 0),
    };
  }).filter((p) => p.services + p.products + p.plans > 0);
}

function Summary({ entries, barbers, methods }: Ctx) {
  const s = summarize(entries);
  const perf = barberPerf(entries, barbers);
  const adminSold = entries.filter((e) => e.kind === "entrada" && e.category !== "servico" && !e.seller_barber_id)
    .reduce((t, e) => t + e.amount_cents - e.discount_cents, 0);
  const maxBarber = Math.max(0, ...perf.map((p) => p.revenue + p.productsValue + p.plansValue));
  const maxCat = Math.max(s.services, s.products, s.plans);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat title="Faturamento bruto" value={brl(s.gross)} tone="brand" />
        <Stat title="Descontos" value={brl(s.discounts)} />
        <Stat title="Comissões" value={brl(s.commissions)} />
        <Stat title="Despesas" value={brl(s.expenses)} />
        <Stat title="Resultado operacional" value={brl(s.result)} tone={s.result < 0 ? "neg" : "gold"} />
        <Stat title="Líquido recebido" value={brl(s.received)} />
      </div>
      <p className="text-xs text-foreground/60">Resultado operacional = bruto − descontos − comissões − despesas. Líquido recebido = bruto − descontos − taxas.</p>

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento por tipo</h2>
        <Bar label="Serviços" value={s.services} max={maxCat} />
        <Bar label="Produtos" value={s.products} max={maxCat} />
        <Bar label="Planos" value={s.plans} max={maxCat} />
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Formas de pagamento</h2>
        {methods.map((m) => {
          const v = s.byMethod[m.id] ?? { gross: 0, fee: 0, count: 0 };
          return (
            <div key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2 text-sm last:border-0">
              <span className="font-semibold">{m.label} <span className="font-normal text-foreground/60">({v.count})</span></span>
              <span className="text-foreground/70">Bruto {brl(v.gross)} · Taxa {brl(v.fee)} · <b className="text-foreground">Líquido {brl(v.gross - v.fee)}</b></span>
            </div>
          );
        })}
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Faturamento geral da barbearia</h2>
        {perf.map((p) => <Bar key={p.id} label={p.name} value={p.revenue + p.productsValue + p.plansValue} max={Math.max(maxBarber, adminSold)} />)}
        <Bar label="Vendido pelo administrador (produtos e planos)" value={adminSold} max={Math.max(maxBarber, adminSold)} />
        <p className="text-xs text-foreground/60">Serviços contam para quem realizou; produtos e planos para quem vendeu.</p>
      </section>
    </>
  );
}

function Overview(ctx: Ctx) {
  const [selected, setSelected] = useState("");
  const perf = barberPerf(ctx.entries, ctx.barbers);
  const today = todaySP();
  const todayEntries = ctx.entries.filter((e) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(e.occurred_at)) === today);
  const isToday = ctx.range.from === today && ctx.range.to === today;
  const d = summarize(todayEntries);
  const sel = perf.find((p) => p.id === selected);
  return (
    <div className="space-y-4">
      <Summary {...ctx} />

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Desempenho por barbeiro</h2>
        {perf.length === 0 && <p className="text-sm text-foreground/70">Sem movimentações de barbeiros no período.</p>}
        <select className={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Todos os barbeiros</option>
          {perf.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="grid gap-3">
          {(sel ? [sel] : perf).map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3">
              <p className="font-bold text-card-foreground">{p.name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-foreground/60">Serviços realizados</dt><dd className="text-right font-semibold">{p.services}</dd>
                <dt className="text-foreground/60">Faturamento gerado</dt><dd className="text-right font-semibold">{brl(p.revenue)}</dd>
                <dt className="text-foreground/60">Produtos vendidos</dt><dd className="text-right font-semibold">{p.products} · {brl(p.productsValue)}</dd>
                <dt className="text-foreground/60">Planos vendidos</dt><dd className="text-right font-semibold">{p.plans} · {brl(p.plansValue)}</dd>
                <dt className="text-foreground/60">Comissão gerada</dt><dd className="text-right font-semibold">{brl(p.commission)}</dd>
                <dt className="text-foreground/60">Comissão pendente</dt><dd className="text-right font-semibold text-gold">{brl(p.pending)}</dd>
                <dt className="text-foreground/60">Comissão paga</dt><dd className="text-right font-semibold">{brl(p.paid)}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="text-base font-bold text-card-foreground">Fechamento do dia — {formatDay(today)}</h2>
        {!ctx.range.to || ctx.range.to < today || ctx.range.from > today ? (
          <p className="text-sm text-foreground/70">Selecione "Hoje" ou um período que inclua hoje para ver o fechamento.</p>
        ) : (
          <>
            {!isToday && <p className="text-xs text-foreground/60">Mostrando apenas os lançamentos de hoje.</p>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-foreground/60">Atendimentos</dt><dd className="text-right font-semibold">{d.appointments}</dd>
              <dt className="text-foreground/60">Total recebido</dt><dd className="text-right font-semibold">{brl(d.gross - d.discounts)}</dd>
              {ctx.methods.map((m) => (
                <Fragment key={m.id}><dt className="text-foreground/60">{m.label}</dt><dd className="text-right font-semibold">{brl(d.byMethod[m.id]?.gross ?? 0)}</dd></Fragment>
              ))}
              <dt className="text-foreground/60">Comissões geradas</dt><dd className="text-right font-semibold">{brl(d.commissions)}</dd>
              <dt className="text-foreground/60">Despesas do dia</dt><dd className="text-right font-semibold">{brl(d.expenses)}</dd>
              <dt className="font-bold">Resultado do dia</dt><dd className="text-right font-bold text-gold">{brl(d.result)}</dd>
            </dl>
            {barberPerf(todayEntries, ctx.barbers).map((p) => (
              <p key={p.id} className="text-sm text-foreground/80">{p.name}: {brl(p.revenue + p.productsValue + p.plansValue)}</p>
            ))}
          </>
        )}
      </section>
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
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-bold ${e.kind === "entrada" ? "text-brand" : "text-destructive"}`}>{e.kind === "entrada" ? "+" : "−"}{brl(e.amount_cents - e.discount_cents)}</p>
          {e.discount_cents > 0 && <p className="text-xs text-foreground/60">desc. {brl(e.discount_cents)}</p>}
          {e.fee_cents > 0 && <p className="text-xs text-foreground/60">taxa {brl(e.fee_cents)}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Movements({ entries, barbers, methods }: Ctx) {
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: "", category: "", barber: "", seller: "", method: "" });
  const [adding, setAdding] = useState(false);
  const list = entries.filter((e) =>
    (!f.kind || e.kind === f.kind) && (!f.category || e.category === f.category) &&
    (!f.barber || e.barber_id === f.barber) && (!f.method || e.payment_method === f.method) &&
    (!f.seller || (f.seller === "admin" ? e.kind === "entrada" && e.category !== "servico" && !e.seller_barber_id : e.seller_barber_id === f.seller)));
  const totalIn = list.filter((e) => e.kind === "entrada").reduce((s, e) => s + e.amount_cents - e.discount_cents, 0);
  const totalOut = list.filter((e) => e.kind === "saida").reduce((s, e) => s + e.amount_cents, 0);
  const cats = [...Object.entries(INCOME_CATEGORIES), ...EXPENSE_CATEGORIES.map((c) => [c, c] as const)];
  return (
    <div className="space-y-4">
      <button type="button" className={`${btn} w-full`} onClick={() => setAdding(!adding)}>+ Registrar venda de produto ou plano</button>
      {adding && <SaleForm barbers={barbers} methods={methods} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["fin-entries"] }); }} />}
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
      <div className="grid gap-3">{list.map((e) => <EntryRow key={e.id} e={e} barbers={barbers} methods={methods} />)}</div>
    </div>
  );
}

function SaleForm({ barbers, methods, onDone }: { barbers: Barber[]; methods: PaymentMethod[]; onDone: () => void }) {
  const [v, setV] = useState({ category: "produto", description: "", amount: "", discount: "", method: "pix", client: "", seller: "", date: todaySP(), note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = toCents(v.amount);
  const commission = !v.seller ? 0 : Math.round(Math.max(amount - toCents(v.discount), 0) * (v.category === "produto" ? 0.3 : 0.5));
  async function save() {
    setErr(null);
    if (!v.description.trim() || amount <= 0) return setErr("Informe descrição e valor.");
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
      <p className="text-sm text-foreground/70">Comissão: <b>{brl(commission)}</b> {v.seller ? `(${v.category === "produto" ? "30%" : "50%"})` : "(100% para a barbearia)"}</p>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      <button type="button" disabled={saving} onClick={save} className={`${btn} w-full`}>{saving ? "Salvando..." : "Salvar venda"}</button>
    </section>
  );
}

function Commissions({ entries, barbers, methods }: Ctx) {
  const qc = useQueryClient();
  const [barber, setBarber] = useState("");
  const [status, setStatus] = useState("");
  const list = entries.filter((e) => e.commission_cents > 0 && (!barber || e.commission_barber_id === barber) && (!status || e.commission_status === status));
  const pending = list.filter((e) => e.commission_status === "pendente").reduce((s, e) => s + e.commission_cents, 0);
  const paid = list.filter((e) => e.commission_status === "paga").reduce((s, e) => s + e.commission_cents, 0);
  async function mark(ids: string[], st: "paga" | "pendente") {
    if (ids.length === 0) return;
    await supabase.from("financial_entries").update({ commission_status: st, commission_paid_at: st === "paga" ? new Date().toISOString() : null }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["fin-entries"] });
  }
  const name = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? "—";
  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-2 sm:grid-cols-2`}>
        <select className={input} value={barber} onChange={(e) => setBarber(e.target.value)}><option value="">Todos os barbeiros</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="pendente">Pendentes</option><option value="paga">Pagas</option></select>
      </section>
      <div className="grid grid-cols-3 gap-2">
        <Stat title="Gerada" value={brl(pending + paid)} />
        <Stat title="Pendente" value={brl(pending)} tone="gold" />
        <Stat title="Paga" value={brl(paid)} tone="brand" />
      </div>
      <p className="text-xs text-foreground/60">Serviços 50% · Produtos 30% · Plano vendido pelo barbeiro 50% · Plano vendido pelo administrador 100% para a barbearia.</p>
      {pending > 0 && <button type="button" className={`${btn} w-full`} onClick={() => mark(list.filter((e) => e.commission_status === "pendente").map((e) => e.id), "paga")}>Marcar todas as pendentes da lista como pagas</button>}
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

function Reports(ctx: Ctx) {
  return (
    <div className="space-y-4" id="relatorio-financeiro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground/70">Use os botões de período acima: Hoje (diário), Esta semana, Este mês ou Personalizado.</p>
        <button type="button" className={btnGhost} onClick={() => window.print()}>Imprimir / salvar PDF</button>
      </div>
      <Summary {...ctx} />
    </div>
  );
}

function Methods({ methods, entries }: Ctx) {
  const qc = useQueryClient();
  const [fees, setFees] = useState<Record<string, string>>({});
  const s = useMemo(() => summarize(entries), [entries]);
  async function update(id: string, patch: Partial<PaymentMethod>) {
    await supabase.from("payment_methods").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["fin-methods"] });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/70">A taxa é aplicada nos novos lançamentos. Valores do período selecionado nas outras abas.</p>
      {methods.map((m) => {
        const v = s.byMethod[m.id] ?? { gross: 0, fee: 0 };
        return (
          <div key={m.id} className={`${card} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-card-foreground">{m.label}</p>
              <button type="button" className={btnGhost} onClick={() => update(m.id, { active: !m.active })}>{m.active ? "Desativar" : "Ativar"}</button>
            </div>
            {!m.active && <p className="text-xs font-semibold uppercase text-foreground/50">Desativada</p>}
            <div className="flex items-end gap-2">
              <label className={`${label} flex-1`}><span>Taxa (%)</span>
                <input inputMode="decimal" className={input} value={fees[m.id] ?? String(m.fee_percent).replace(".", ",")} onChange={(e) => setFees({ ...fees, [m.id]: e.target.value })} />
              </label>
              <button type="button" className={btn} onClick={() => update(m.id, { fee_percent: parseFloat((fees[m.id] ?? String(m.fee_percent)).replace(",", ".")) || 0 })}>Salvar</button>
            </div>
            <p className="text-sm text-foreground/70">Bruto {brl(v.gross)} · Taxa {brl(v.fee)} · <b className="text-foreground">Líquido {brl(v.gross - v.fee)}</b></p>
          </div>
        );
      })}
    </div>
  );
}

