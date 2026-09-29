export const EXPENSE_CATEGORIES = [
  "Aluguel", "Energia", "Água", "Internet", "Produtos", "Materiais",
  "Marketing", "Manutenção", "Equipamentos", "Taxas", "Outros",
] as const;

export const INCOME_CATEGORIES: Record<string, string> = {
  servico: "Serviço",
  produto: "Produto",
  plano: "Plano",
};

export type Entry = {
  id: string;
  kind: "entrada" | "saida";
  category: string;
  description: string;
  amount_cents: number;
  discount_cents: number;
  fee_cents: number;
  fee_percent: number;
  commission_percent: number;
  received_by?: string | null;
  payment_method: string | null;
  occurred_at: string;
  client_name: string;
  barber_id: string | null;
  seller_barber_id: string | null;
  appointment_id: string | null;
  note: string;
  commission_barber_id: string | null;
  commission_cents: number;
  commission_status: "nenhuma" | "pendente" | "paga";
  commission_paid_at: string | null;
};

export type PaymentMethod = { id: string; label: string; fee_percent: number; active: boolean; sort_order: number };

export type PeriodKey = "hoje" | "ontem" | "semana" | "mes" | "mes_anterior" | "personalizado";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "mes_anterior", label: "Mês anterior" },
  { key: "personalizado", label: "Personalizado" },
];

const sp = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Retorna intervalo de datas (YYYY-MM-DD, inclusivo) no fuso de São Paulo. */
export function periodRange(key: PeriodKey, custom: { from: string; to: string }): { from: string; to: string } {
  const today = sp(new Date());
  if (key === "hoje") return { from: today, to: today };
  if (key === "ontem") { const y = addDays(today, -1); return { from: y, to: y }; }
  if (key === "semana") {
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 dom
    return { from: addDays(today, -((wd + 6) % 7)), to: today };
  }
  if (key === "mes") return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === "mes_anterior") {
    const first = `${today.slice(0, 8)}01`;
    const last = addDays(first, -1);
    return { from: `${last.slice(0, 8)}01`, to: last };
  }
  return custom;
}

export const rangeToIso = (r: { from: string; to: string }) => ({
  from: new Date(`${r.from}T00:00:00-03:00`).toISOString(),
  to: new Date(`${addDays(r.to, 1)}T00:00:00-03:00`).toISOString(),
});

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const toCents = (v: string) => Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".") || "0") * 100);

/** Ordem oficial: original → desconto → pago → taxa → líquido → comissão. Valores gravados na transação. */
export const paid = (e: Entry) => e.amount_cents - e.discount_cents;
export const net = (e: Entry) => paid(e) - e.fee_cents;

type Agg = { count: number; gross: number; discounts: number; paid: number; fees: number; net: number; commission: number };
const emptyAgg = (): Agg => ({ count: 0, gross: 0, discounts: 0, paid: 0, fees: 0, net: 0, commission: 0 });
function add(a: Agg, e: Entry) {
  a.count += 1; a.gross += e.amount_cents; a.discounts += e.discount_cents; a.paid += paid(e);
  a.fees += e.fee_cents; a.net += net(e); a.commission += e.commission_cents;
}
const aggOf = (l: Entry[]) => { const a = emptyAgg(); l.forEach((e) => add(a, e)); return a; };

export function summarize(entries: Entry[]) {
  const inc = entries.filter((e) => e.kind === "entrada");
  const out = entries.filter((e) => e.kind === "saida");
  const t = aggOf(inc);
  const expenses = out.reduce((s, e) => s + e.amount_cents, 0);
  const byMethod: Record<string, Agg> = {};
  for (const e of inc) add((byMethod[e.payment_method ?? "outro"] ??= emptyAgg()), e);
  const byCategory: Record<string, Agg> = {};
  for (const e of inc) add((byCategory[e.category] ??= emptyAgg()), e);
  const byService: Record<string, Agg> = {};
  for (const e of inc.filter((x) => x.category !== "servico" ? false : true)) add((byService[e.description || "Atendimento"] ??= emptyAgg()), e);
  const byItem = (c: string) => { const r: Record<string, Agg> = {}; for (const e of inc.filter((x) => x.category === c)) add((r[e.description || c] ??= emptyAgg()), e); return r; };
  const byExpense: Record<string, number> = {};
  for (const e of out) byExpense[e.category] = (byExpense[e.category] ?? 0) + e.amount_cents;
  return {
    ...t,
    commissions: t.commission,
    expenses,
    /** Resultado operacional = líquido − comissões − despesas */
    result: t.net - t.commission - expenses,
    received: t.net,
    services: byCategory["servico"]?.paid ?? 0,
    products: byCategory["produto"]?.paid ?? 0,
    plans: byCategory["plano"]?.paid ?? 0,
    appointments: inc.filter((e) => e.appointment_id).length,
    byMethod, byCategory, byService, byProduct: byItem("produto"), byPlan: byItem("plano"), byExpense,
  };
}

export type BarberPerf = {
  id: string; name: string;
  services: number; products: number; plans: number;
  /** Faturamento atribuído: serviços realizados + produtos/planos vendidos */
  totals: Agg;
  commissionBase: number; commission: number; pending: number; paid: number;
};

/** Serviço conta para quem realizou; produto/plano para quem vendeu. Sem vendedor = administrador. */
export const attributedTo = (e: Entry) => (e.category === "servico" ? e.barber_id : e.seller_barber_id);

export function barberPerf(entries: Entry[], barbers: { id: string; name: string }[]): BarberPerf[] {
  const inc = entries.filter((e) => e.kind === "entrada");
  return barbers.map((b) => {
    const mine = inc.filter((e) => attributedTo(e) === b.id);
    const comm = inc.filter((e) => e.commission_barber_id === b.id && e.commission_cents > 0);
    return {
      id: b.id, name: b.name,
      services: mine.filter((e) => e.category === "servico").length,
      products: mine.filter((e) => e.category === "produto").length,
      plans: mine.filter((e) => e.category === "plano").length,
      totals: aggOf(mine),
      commissionBase: comm.reduce((s, e) => s + net(e), 0),
      commission: comm.reduce((s, e) => s + e.commission_cents, 0),
      pending: comm.filter((e) => e.commission_status === "pendente").reduce((s, e) => s + e.commission_cents, 0),
      paid: comm.filter((e) => e.commission_status === "paga").reduce((s, e) => s + e.commission_cents, 0),
    };
  }).filter((p) => p.totals.count > 0 || p.commission > 0);
}

export function adminTotals(entries: Entry[]) {
  return aggOf(entries.filter((e) => e.kind === "entrada" && !attributedTo(e)));
}

export const pct = (n: number) => `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export type CommissionSettings = { commission_service_pct: number; commission_product_pct: number; commission_plan_pct: number };
