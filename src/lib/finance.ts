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

export const net = (e: Entry) => e.amount_cents - e.discount_cents - e.fee_cents;

export function summarize(entries: Entry[]) {
  const inc = entries.filter((e) => e.kind === "entrada");
  const out = entries.filter((e) => e.kind === "saida");
  const sum = (l: Entry[], f: (e: Entry) => number) => l.reduce((s, e) => s + f(e), 0);
  const gross = sum(inc, (e) => e.amount_cents);
  const discounts = sum(inc, (e) => e.discount_cents);
  const fees = sum(inc, (e) => e.fee_cents);
  const commissions = sum(inc, (e) => e.commission_cents);
  const expenses = sum(out, (e) => e.amount_cents);
  const byCat = (c: string) => sum(inc.filter((e) => e.category === c), (e) => e.amount_cents - e.discount_cents);
  const byMethod: Record<string, { gross: number; fee: number; count: number }> = {};
  for (const e of inc) {
    const k = e.payment_method ?? "outro";
    byMethod[k] ??= { gross: 0, fee: 0, count: 0 };
    byMethod[k].gross += e.amount_cents - e.discount_cents;
    byMethod[k].fee += e.fee_cents;
    byMethod[k].count += 1;
  }
  return {
    gross, discounts, fees, commissions, expenses,
    result: gross - discounts - commissions - expenses,
    received: gross - discounts - fees,
    services: byCat("servico"), products: byCat("produto"), plans: byCat("plano"),
    appointments: inc.filter((e) => e.appointment_id).length,
    byMethod,
  };
}
