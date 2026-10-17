import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Minus, X, Check, Banknote, CreditCard, ArrowDownLeft } from "lucide-react";
import { cashChange } from "@/lib/cash-change";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { formatTime, isServiceBlocked, extraServicePrice, type ServiceCombo } from "@/lib/booking";
import { ClientDetailDialog } from "@/components/app/ClientDetailDialog";
import { getPanelAccess } from "@/lib/admin";
import { BarberDayGrid } from "@/components/app/BarberDayGrid";
import { brl, toCents } from "@/lib/finance";
import { EncaixeDialog } from "@/components/app/EncaixeDialog";
import { todaySP } from "@/lib/absences";
import { buildBarberColors, tint } from "@/lib/barber-colors";

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const spStartISO = (d: string) => new Date(`${d}T00:00:00-03:00`).toISOString();
const spDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const dayPart = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...o }).format(new Date(`${d}T12:00:00Z`)).replace(".", "");

export const Route = createFileRoute("/_authenticated/painel")({
  validateSearch: (s: Record<string, unknown>): { ver?: string } =>
    typeof s["ver"] === "string" ? { ver: s["ver"] } : {},
  head: () => ({
    meta: [
      { title: "Painel do barbeiro | LA CREME BARBER" },
      { name: "description", content: "Controle dos atendimentos da LA CREME BARBER." },
      { property: "og:title", content: "Painel do barbeiro | LA CREME BARBER" },
      { property: "og:description", content: "Controle dos atendimentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BarberPanel,
});

const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

const ACTIONS = [
  { status: "finalizado", label: "Finalizar" },
  { status: "cancelado", label: "Cancelar" },
  { status: "nao_compareceu", label: "Não compareceu" },
] as const;

function BarberPanel() {
  const queryClient = useQueryClient();
  const { ver } = Route.useSearch();

  const accessQuery = useQuery({
    queryKey: ["panel-access-page"],
    queryFn: getPanelAccess,
  });
  const access = accessQuery.data ?? null;
  const previewId = access?.role === "admin" && ver ? ver : null;
  const pending = access?.role === "barbeiro_pendente" ? (access as { role: "barbeiro_pendente"; reason: "aguardando" | "desativado" }) : null;
  const barberFilter = access?.role === "barbeiro" ? access.barberId : previewId;

  const previewNameQuery = useQuery({
    queryKey: ["preview-barber", previewId],
    enabled: !!previewId,
    queryFn: async () => (await supabase.from("barbers").select("name").eq("id", previewId!).maybeSingle()).data?.name ?? "",
  });

  const [day, setDay] = useState(todaySP());
  const stripStart = day < todaySP() ? day : (() => { const s3 = addDays(day, -3); return s3 < todaySP() ? todaySP() : s3; })();
  const strip = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i));

  const barbersQuery = useQuery({
    queryKey: ["panel-barber-colors"],
    enabled: access != null && !pending,
    queryFn: async () => (await supabase.from("barbers").select("id, name, color, sort_order, created_at, active, approved_at, archived_at").order("sort_order").order("created_at")).data ?? [],
  });
  const colors = buildBarberColors(barbersQuery.data ?? []);
  const colorOf = (id: string) => colors.get(id) ?? "var(--barber-1)";

  const appointmentsQuery = useQuery({
    queryKey: ["panel-appointments", barberFilter ?? "all", stripStart],
    enabled: access != null && !pending,
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, services_label, service_ids, total_price_cents, total_duration_minutes, customer_first_name, customer_last_name, customer_whatsapp, client_id, barber_id, is_walkin, client_plan_id, client_plans(total_uses, used_uses), services(name), barbers(name, color)",
        )
        .gte("starts_at", spStartISO(stripStart))
        .lt("starts_at", spStartISO(addDays(stripStart, 7)))
        .order("starts_at", { ascending: true });
      if (barberFilter) {
        query = query.eq("barber_id", barberFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const weekAppts = appointmentsQuery.data ?? [];
  const dayAppts = weekAppts.filter((a) => spDate(a.starts_at) === day);
  const countOn = (d: string) => weekAppts.filter((a) => a.status !== "cancelado" && spDate(a.starts_at) === d).length;

  const methodsQuery = useQuery({
    queryKey: ["panel-methods"],
    enabled: access != null && !pending,
    queryFn: async () => (await supabase.from("payment_methods").select("id, label").eq("active", true).order("sort_order")).data ?? [],
  });
  const [paying, setPaying] = useState<string | null>(null);
  const productsQuery = useQuery({
    queryKey: ["panel-products", paying],
    enabled: !!paying,
    queryFn: async () => (await supabase.rpc("get_sellable_products")).data ?? [],
  });
  const servicesQuery = useQuery({
    queryKey: ["panel-services", paying],
    enabled: !!paying,
    queryFn: async () => { const { data, error } = await supabase.from("services").select("id, name, price_cents").eq("active", true).order("sort_order"); if (error) throw error; return data ?? []; },
  });
  const combosQuery = useQuery({
    queryKey: ["panel-combos", paying],
    enabled: !!paying,
    queryFn: async () => { const { data, error } = await supabase.from("service_combos").select("*").eq("active", true); if (error) throw error; return data ?? []; },
  });
  const [detail, setDetail] = useState<string | null>(null);
  const receiptQuery = useQuery({
    queryKey: ["panel-receipt", detail],
    enabled: !!detail,
    queryFn: async () => {
      if (!detail) return null;
      const { data } = await supabase.from("financial_entries").select("cash_received_cents, change_cents, change_method").eq("appointment_id", detail).eq("category", "servico").maybeSingle();
      return data;
    },
  });
  const [clientCard, setClientCard] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [pickSvc, setPickSvc] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pick, setPick] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [removing, setRemoving] = useState(false);
  const [rename, setRename] = useState<{ id: string; first: string; last: string } | null>(null);
  const [renameErr, setRenameErr] = useState<string | null>(null);
  async function saveRename() {
    if (!rename) return;
    setRenameErr(null);
    const { error } = await supabase.rpc("rename_appointment", { _id: rename.id, _first: rename.first, _last: rename.last });
    if (error) return setRenameErr(error.message || "Não foi possível salvar.");
    setRename(null);
    queryClient.invalidateQueries();
  }
  const [method, setMethod] = useState("pix");
  const [discount, setDiscount] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [hasChange, setHasChange] = useState(false);
  const [changeMethod, setChangeMethod] = useState("pix");
  const [payError, setPayError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [encaixe, setEncaixe] = useState(false);
  const isBarber = access?.role === "barbeiro";
  const actions = ACTIONS.filter((a) => a.status !== "cancelado" || access?.role === "admin");

  async function setStatus(id: string, status: string) {
    if (status === "finalizado") {
      setPaying(id);
      setPayError(null);
      setDiscount("");
      setCashReceived("");
      setHasChange(false);
      setChangeMethod("pix");
      setCart({});
      setPick("");
      setExtras({});
      setPickSvc("");
      setMethod(methodsQuery.data?.[0]?.id ?? "pix");
      return;
    }
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) { window.alert("Não foi possível alterar o atendimento: " + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
  }

  async function confirmPayment() {
    if (!paying) return;
    if (change.error) return setPayError(change.error);
    setPayBusy(true);
    setPayError(null);
    const { error } = await supabase.rpc("finalize_appointment_with_change", {
      _appointment_id: paying,
      _method: method,
      _discount_cents: toCents(discount),
      _products: Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })),
      _services: Object.entries(extras).map(([service_id, quantity]) => ({ service_id, quantity })),
      ...(method === "dinheiro" && hasChange && cashReceived.trim() ? { _cash_received_cents: toCents(cashReceived) } : {}),
      _change_method: changeMethod,
    });
    setPayBusy(false);
    if (error) return setPayError(error.message || "Não foi possível finalizar.");
    setPaying(null);
    queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["fin-entries"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["panel-receipt"] });
  }
  const products = productsQuery.data ?? [];
  const productsTotal = Object.entries(cart).reduce((s, [id, q]) => s + (products.find((p) => p.id === id)?.price_cents ?? 0) * q, 0);
  function addProduct() {
    const p = products.find((x) => x.id === pick);
    if (!p) return;
    const q = (cart[p.id] ?? 0) + 1;
    if (q > p.stock) return setPayError(`Estoque insuficiente de ${p.name}: disponível ${p.stock}.`);
    setPayError(null);
    setCart({ ...cart, [p.id]: q });
  }
  function changeQty(id: string, delta: number) {
    const p = products.find((x) => x.id === id);
    const q = (cart[id] ?? 0) + delta;
    if (p && q > p.stock) return setPayError(`Estoque insuficiente de ${p.name}: disponível ${p.stock}.`);
    setPayError(null);
    const next = { ...cart };
    if (q <= 0) delete next[id]; else next[id] = q;
    setCart(next);
  }
  type BarberRow = { id: string; name: string; active?: boolean; approved_at?: string | null; archived_at?: string | null };
  const teamBarbers = ((barbersQuery.data ?? []) as BarberRow[]).filter((b) => b.active && b.approved_at && !b.archived_at);
  const legend = !barberFilter
    ? teamBarbers.map((b) => ({ id: b.id, name: b.name, count: dayAppts.filter((x) => x.barber_id === b.id && x.status !== "cancelado").length }))
    : [];
  const isHidden = (s: string) => s === "cancelado" || s === "nao_compareceu";
  const byBarber = dayAppts.filter((a) => !colorFilter || a.barber_id === colorFilter);
  const shown = byBarber;
  const groups = [
    { label: "Aguardando atendimento", items: shown.filter((a) => a.status !== "finalizado" && !isHidden(a.status)) },
    { label: "Finalizados", items: shown.filter((a) => a.status === "finalizado") },
    { label: "Cancelados e não compareceram", items: shown.filter((a) => isHidden(a.status)) },
  ];
  const payingItem = appointmentsQuery.data?.find((a) => a.id === paying);
  const allServices = servicesQuery.data ?? [];
  const bookedSvc = allServices.filter((x) => payingItem?.service_ids?.includes(x.id));
  const extraSvc = allServices.filter((x) => extras[x.id]);
  // Corte inclui Pezinho; Barba inclui Bigode (mesma regra do agendamento).
  const addable = allServices.filter((x) => !isServiceBlocked(x, [...bookedSvc, ...extraSvc]));
  const combos = (combosQuery.data ?? []) as unknown as ServiceCombo[];
  const extraPrice = (x: { id: string; price_cents: number }, q = 1) => {
    const ctx = [...(payingItem?.service_ids ?? []), ...Object.keys(extras).filter((id) => id !== x.id)];
    return extraServicePrice(x, ctx, combos, q);
  };
  const extrasTotal = Object.entries(extras).reduce((t, [id, q]) => {
    const s = allServices.find((x) => x.id === id);
    return t + (s ? extraPrice(s, q) : 0);
  }, 0);
  const servicesTotal = (payingItem?.total_price_cents ?? 0) + extrasTotal;
  const totalDue = servicesTotal - toCents(discount) + productsTotal;
  const change = cashChange(totalDue, cashReceived.trim() ? toCents(cashReceived) : null, method === "dinheiro" && hasChange);
  function changeSvc(id: string, delta: number) {
    const q = (extras[id] ?? 0) + delta;
    const next = { ...extras };
    if (q <= 0) delete next[id]; else next[id] = Math.min(q, 20);
    setExtras(next);
  }

  async function removeBookedService(id: string) {
    if (!paying || removing || !window.confirm("Retirar este serviço do atendimento? O valor será recalculado.")) return;
    setRemoving(true); setPayError(null);
    const { error } = await supabase.rpc("remove_appointment_service", { _appointment_id: paying, _service_id: id });
    setRemoving(false);
    if (error) return setPayError(error.message || "Não foi possível retirar o serviço.");
    await queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["barber-day"] });
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground">Meu Painel</h1>
          {(isBarber || (access?.role === "admin" && !previewId)) && (
            <button type="button" onClick={() => setEncaixe(true)} className="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-brand-foreground">
              + Agendamento avulso
            </button>
          )}
        </div>
        {previewId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand bg-secondary p-3">
            <p className="text-sm font-semibold text-foreground">
              Visualização de teste: {previewNameQuery.data || "barbeiro"} — somente teste
            </p>
            <Link to="/painel" search={{}} className="min-h-11 rounded-md bg-brand px-3 py-2 text-sm font-bold text-brand-foreground">
              Voltar para minha conta
            </Link>
          </div>
        )}

        {(accessQuery.isLoading || (access && appointmentsQuery.isLoading)) && (
          <p className="text-base text-foreground/70">Carregando...</p>
        )}

        {accessQuery.data === null && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-base text-foreground/80">
              Acesso restrito ao barbeiro.
            </p>
          </div>
        )}

        {pending && (
          <div className="rounded-lg border border-gold bg-card p-6 text-center">
            <p className="text-base font-bold text-card-foreground">
              {pending.reason === "aguardando" ? "Cadastro concluído" : "Acesso desativado"}
            </p>
            <p className="mt-1 text-base text-foreground/80">
              {pending.reason === "aguardando"
                ? "Seu cadastro está aguardando ativação da administração da LA CREME BARBER. Assim que for ativado, sua agenda aparecerá aqui."
                : "Seu acesso de barbeiro está desativado. Fale com a administração da LA CREME BARBER."}
            </p>
          </div>
        )}

        {access != null && !pending && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm" aria-label="Escolher o dia">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Dia anterior" onClick={() => setDay(addDays(day, -1))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-input text-lg font-bold text-foreground">‹</button>
              <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md bg-brand px-3 text-center text-brand-foreground">
                <span className="block truncate text-sm font-bold first-letter:uppercase">
                  {day === todaySP() ? "Hoje · " : day === addDays(todaySP(), 1) ? "Amanhã · " : ""}
                  {dayPart(day, { weekday: "long", day: "2-digit", month: "short" })}
                </span>
                <input type="date" aria-label="Abrir calendário" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <button type="button" aria-label="Próximo dia" onClick={() => setDay(addDays(day, 1))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-input text-lg font-bold text-foreground">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {strip.map((d) => {
                const n = countOn(d);
                const sel = d === day;
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={sel}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-lg border text-xs ${sel ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-foreground"}`}>
                    <span className="uppercase opacity-70">{dayPart(d, { weekday: "short" })}</span>
                    <span className="text-base font-bold tabular-nums">{dayPart(d, { day: "2-digit" })}</span>
                    <span className={`mt-0.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${sel ? "bg-gold text-gold-foreground" : n ? "bg-secondary text-foreground" : "text-foreground/40"}`}>
                      {n || "livre"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-foreground/60">O número mostra quantos atendimentos há em cada dia — menos atendimentos, mais horários livres.</p>
          </section>
        )}

        {appointmentsQuery.isError && (
          <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">Não foi possível carregar os agendamentos. Atualize a página.</div>
        )}

        {legend.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por barbeiro">
            <button type="button" onClick={() => setColorFilter("")}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${!colorFilter ? "border-brand bg-brand text-brand-foreground" : "border-input bg-card text-foreground/80"}`}>
              Todos <span className="tabular-nums opacity-80">{legend.reduce((t, b) => t + b.count, 0)}</span>
            </button>
            {legend.map((b) => {
              const c = colorOf(b.id);
              const on = colorFilter === b.id;
              return (
                <button key={b.id} type="button" onClick={() => setColorFilter(on ? "" : b.id)}
                  className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border-2 px-3 text-xs font-semibold text-foreground"
                  style={{ borderColor: on ? c : "transparent", backgroundColor: tint(c, on ? 18 : 10) }}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
                  {b.name}
                  <span className="rounded-full px-1.5 text-[11px] font-bold tabular-nums text-brand-foreground" style={{ backgroundColor: c }}>{b.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {access != null && !pending && !appointmentsQuery.isLoading && !appointmentsQuery.isError && shown.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <p className="text-base text-foreground/80">Nenhum agendamento neste dia.</p>
          </div>
        )}

        {groups.map((group) => (
        <section key={group.label} className="space-y-3" aria-label={group.label}>
          <h2 className="font-display text-lg font-bold text-foreground">{group.label} ({group.items.length})</h2>
          {!appointmentsQuery.isLoading && !appointmentsQuery.isError && group.items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento.</p>}
          <div className="grid gap-3">
          {group.items.map((item) => {
            const when = new Date(item.starts_at);
            const c = colorOf(item.barber_id);
            const faded = item.status === "cancelado" || item.status === "nao_compareceu";
            const statusStyle = faded ? "border-destructive/60 bg-destructive/10" : item.status === "finalizado" ? "border-success/60 bg-success/10" : "border-warning/60 bg-warning/15";
            return (
              <div key={item.id} className={`overflow-hidden rounded-lg border border-l-4 shadow-sm ${statusStyle}`}>
                <div className="flex cursor-pointer items-stretch gap-3 p-4" title="Ver detalhes"
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("button,input,select,a")) setDetail(item.id); }}>
                  <div className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-lg ${faded ? "bg-destructive text-destructive-foreground" : item.status === "finalizado" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                    <span className="text-base font-bold tabular-nums">{formatTime(when)}</span>
                    <span className="text-[10px] tabular-nums opacity-85">{formatTime(new Date(item.ends_at))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" disabled={!!previewId} title="Alterar nome"
                        onClick={() => { setRenameErr(null); setRename({ id: item.id, first: item.customer_first_name, last: item.customer_last_name }); }}
                        className={`min-w-0 truncate text-left text-base font-bold underline-offset-2 hover:underline ${faded ? "text-destructive line-through" : "text-card-foreground"}`}>
                        {item.customer_first_name} {item.customer_last_name}
                      </button>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${faded ? "bg-destructive text-destructive-foreground" : item.status === "finalizado" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </div>
                    <p className="break-words text-sm text-foreground/75">{item.services_label || item.services?.name}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{brl(item.total_price_cents ?? 0)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: c }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />{item.barbers?.name}
                      </span>
                      {item.is_walkin && <span className="rounded-full border border-gold px-2 py-0.5 font-semibold text-foreground">Avulso/Encaixe</span>}
                      {(item as any).client_plans && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-foreground">Plano (restam {(item as any).client_plans.total_uses - (item as any).client_plans.used_uses})</span>}
                    </div>
                    {rename?.id === item.id && (
                      <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input aria-label="Nome" className="min-h-11 min-w-0 rounded-md border border-input bg-background px-2 text-base" value={rename.first} onChange={(e) => setRename({ ...rename, first: e.target.value })} />
                          <input aria-label="Sobrenome" className="min-h-11 min-w-0 rounded-md border border-input bg-background px-2 text-base" value={rename.last} onChange={(e) => setRename({ ...rename, last: e.target.value })} />
                        </div>
                        {renameErr && <p className="text-sm text-destructive">{renameErr}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setRename(null)} className="min-h-11 flex-1 rounded-md border border-input text-sm font-semibold">Cancelar</button>
                          <button type="button" onClick={saveRename} className="min-h-11 flex-1 rounded-md bg-brand text-sm font-bold text-brand-foreground">Salvar nome</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {item.status === "agendado" && !previewId && (
                  <div className={`grid gap-2 border-t border-border bg-card/70 p-3 ${actions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {actions.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        onClick={() => setStatus(item.id, action.status)}
                        className="min-h-11 rounded-md border border-input bg-card px-2 text-xs font-semibold text-foreground"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </section>
        ))}

        {access != null && !pending && barberFilter && <BarberDayGrid barberId={barberFilter} day={day} />}
      </main>
      {encaixe && (isBarber || access?.role === "admin") && (
        <EncaixeDialog {...(isBarber ? { barberId: access.barberId } : {})} onClose={() => setEncaixe(false)}
          onDone={() => { setEncaixe(false); queryClient.invalidateQueries({ queryKey: ["panel-appointments"] }); queryClient.invalidateQueries({ queryKey: ["barber-day"] }); }} />
      )}
      {clientCard && <ClientDetailDialog clientId={clientCard} onClose={() => setClientCard(null)} />}
      {detail && (() => {
        const a = weekAppts.find((x) => x.id === detail) as any;
        if (!a) return null;
        const row = (k: string, v: React.ReactNode) => (
          <div className="flex justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><span className="text-foreground/60">{k}</span><span className="text-right font-semibold text-card-foreground">{v}</span></div>
        );
        return (
          <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-3 sm:place-items-center" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
            <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-2 text-lg font-bold text-card-foreground">Detalhes do agendamento</h2>
              {row("Cliente", `${a.customer_first_name} ${a.customer_last_name}`)}
              {a.customer_whatsapp && row("WhatsApp", a.customer_whatsapp)}
              {row("Data", new Date(a.starts_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }))}
              {row("Horário", `${formatTime(new Date(a.starts_at))} – ${formatTime(new Date(a.ends_at))}`)}
              {row("Serviços", a.services_label || a.services?.name)}
              {a.total_duration_minutes != null && row("Duração", `${a.total_duration_minutes} min`)}
              {row("Valor", brl(a.total_price_cents ?? 0))}
              {row("Barbeiro", a.barbers?.name)}
              {row("Situação", STATUS_LABELS[a.status] ?? a.status)}
              {a.client_plans && row("Plano", `restam ${a.client_plans.total_uses - a.client_plans.used_uses} de ${a.client_plans.total_uses}`)}
              {a.is_walkin && row("Tipo", "Avulso/Encaixe")}
              {receiptQuery.data?.cash_received_cents != null && row("Dinheiro recebido", brl(receiptQuery.data.cash_received_cents))}
              {receiptQuery.data?.change_cents != null && row(`Troco (${receiptQuery.data.change_method === "pix" ? "Pix" : "dinheiro"})`, brl(receiptQuery.data.change_cents))}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDetail(null)} className="min-h-11 rounded-md border border-input text-sm font-semibold">Fechar</button>
                <button type="button" disabled={!a.client_id} onClick={() => { setClientCard(a.client_id); setDetail(null); }}
                  className="min-h-11 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50">Ficha do cliente</button>
              </div>
            </div>
          </div>
        );
      })()}
      {paying && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="payment-title">
          <div className="flex max-h-[94svh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-card">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="payment-title" className="text-xl font-bold">Finalizar atendimento</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">{payingItem?.customer_first_name} {payingItem?.customer_last_name}{payingItem && ` · ${formatTime(new Date(payingItem.starts_at))}`}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Fechar finalização" title="Fechar" disabled={payBusy} onClick={() => setPaying(null)}><X /></Button>
            </header>
            <div className="overflow-y-auto overscroll-contain">
            <div className="grid sm:grid-cols-[1.1fr_1fr]">
            <section className="min-w-0 space-y-5 p-5 sm:border-r sm:border-border sm:p-6" aria-label="Itens do atendimento">
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">Serviços agendados</p>
              {bookedSvc.map((s) => <div key={s.id} className="flex min-h-10 items-center justify-between gap-2 border-b border-border text-sm last:border-0">
                <span>{s.name}</span>
                <Button variant="ghost" size="icon" title="Retirar serviço" aria-label={`Retirar ${s.name}`} disabled={removing || payBusy || (payingItem?.service_ids?.length ?? 0) <= 1} onClick={() => removeBookedService(s.id)}><Trash2 /></Button>
              </div>)}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Adicionar serviço</p>
              <div className="flex gap-2">
                <select aria-label="Serviço adicional" value={pickSvc} onChange={(e) => setPickSvc(e.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">{servicesQuery.isLoading ? "Carregando..." : "Escolha um serviço"}</option>
                  {addable.map((x) => <option key={x.id} value={x.id}>{x.name} — {brl(extraPrice(x))}</option>)}
                </select>
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" title="Adicionar serviço" aria-label="Adicionar serviço" disabled={!pickSvc || payBusy} onClick={() => { changeSvc(pickSvc, 1); setPickSvc(""); }}><Plus /></Button>
              </div>
              {extraSvc.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">{x.name} — {brl(extraPrice(x, extras[x.id] ?? 0))}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" title="Diminuir serviço" aria-label={`Diminuir ${x.name}`} disabled={payBusy} onClick={() => changeSvc(x.id, -1)}><Minus /></Button>
                    <span className="w-6 text-center font-bold">{extras[x.id]}</span>
                    <Button variant="ghost" size="icon" title="Aumentar serviço" aria-label={`Aumentar ${x.name}`} disabled={payBusy} onClick={() => changeSvc(x.id, 1)}><Plus /></Button>
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border pt-5">
              <p className="text-sm font-semibold text-foreground">Adicionar produto</p>
              <div className="flex gap-2">
                <select aria-label="Produto adicional" value={pick} onChange={(e) => setPick(e.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">{productsQuery.isLoading ? "Carregando..." : products.length ? "Escolha um produto" : "Nenhum produto disponível"}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)} ({p.stock} em estoque)</option>)}
                </select>
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" title="Adicionar produto" aria-label="Adicionar produto" onClick={addProduct} disabled={!pick || payBusy}><Plus /></Button>
              </div>
              {Object.entries(cart).map(([id, q]) => {
                const p = products.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{p?.name} — {brl((p?.price_cents ?? 0) * q)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" title="Diminuir produto" aria-label={`Diminuir ${p?.name}`} disabled={payBusy} onClick={() => changeQty(id, -1)}><Minus /></Button>
                      <span className="w-6 text-center font-bold">{q}</span>
                      <Button variant="ghost" size="icon" title="Aumentar produto" aria-label={`Aumentar ${p?.name}`} disabled={payBusy} onClick={() => changeQty(id, 1)}><Plus /></Button>
                    </span>
                  </div>
                );
              })}
            </div>
            </section>
            <section className="min-w-0 space-y-5 border-t border-border bg-muted/40 p-5 sm:border-t-0 sm:p-6" aria-label="Pagamento">
            <h3 className="text-sm font-bold">Pagamento</h3>
            <div className="grid grid-cols-2 gap-2" aria-label="Forma de pagamento">
              {methodsQuery.data?.map((m) => (
                <Button key={m.id} variant={method === m.id ? "default" : "outline"} aria-pressed={method === m.id} disabled={payBusy} onClick={() => { setMethod(m.id); setPayError(null); }} className="min-h-11 h-auto whitespace-normal px-2 py-2 text-xs">
                  {m.id === "dinheiro" ? <Banknote /> : m.id === "pix" ? <ArrowDownLeft /> : <CreditCard />}{m.label}
                </Button>
              ))}
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Desconto nos serviços</span>
              <div className="flex h-11 items-center rounded-md border border-input bg-card px-3"><span className="text-muted-foreground">R$</span><input aria-label="Desconto nos serviços" inputMode="decimal" disabled={payBusy} value={discount} placeholder="0,00" onChange={(e) => setDiscount(e.target.value)} className="h-full w-full min-w-0 bg-transparent pl-2 text-base outline-none" /></div>
            </label>
            {payingItem?.total_price_cents != null && (
              <div className="space-y-2 border-t border-border pt-4 text-sm text-foreground">
                <p className="flex justify-between"><span>Serviços</span><span>{brl(servicesTotal)}</span></p>
                {toCents(discount) > 0 && <p className="flex justify-between"><span>Desconto (serviços)</span><span>−{brl(toCents(discount))}</span></p>}
                {productsTotal > 0 && <p className="flex justify-between"><span>Produtos</span><span>{brl(productsTotal)}</span></p>}
                <p className="flex items-center justify-between gap-2 pt-2 font-bold"><span>Total a pagar</span><span className="text-2xl tabular-nums">{brl(totalDue)}</span></p>
              </div>
            )}
            {method === "dinheiro" && <div className="space-y-3 border-t border-border pt-4">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <label htmlFor="has-change" className="cursor-pointer text-sm font-medium">Teve troco?</label>
                <Switch id="has-change" checked={hasChange} disabled={payBusy} onCheckedChange={(checked) => { setHasChange(checked); setCashReceived(""); setChangeMethod("pix"); setPayError(null); }} />
              </div>
              {hasChange && <>
              <label className="block space-y-1.5 text-sm font-medium"><span>Dinheiro recebido</span>
                <div className="flex h-11 items-center rounded-md border border-input bg-card px-3"><span className="text-muted-foreground">R$</span><input aria-label="Dinheiro recebido" inputMode="decimal" disabled={payBusy} value={cashReceived} placeholder="0,00" onChange={(e) => { setCashReceived(e.target.value); setPayError(null); }} className="h-full w-full min-w-0 bg-transparent pl-2 text-base outline-none" /></div>
              </label>
              {cashReceived.trim() && !change.error && <>
                <p className="flex items-center justify-between gap-2 text-sm font-semibold"><span>Troco</span><span className="text-lg tabular-nums">{brl(change.changeCents)}</span></p>
                {change.changeCents > 0 && <fieldset className="space-y-2"><legend className="text-sm text-muted-foreground">Devolver troco em</legend><div className="grid grid-cols-2 gap-2">{[{ id: "pix", label: "Pix" }, { id: "dinheiro", label: "Dinheiro" }].map((m) => <Button key={m.id} disabled={payBusy} aria-pressed={changeMethod === m.id} variant={changeMethod === m.id ? "default" : "outline"} onClick={() => setChangeMethod(m.id)} className="h-11">{m.id === "pix" ? <ArrowDownLeft /> : <Banknote />}{m.label}</Button>)}</div></fieldset>}
              </>}
              {change.error && <p role="alert" className="text-sm text-destructive">{change.error}</p>}
              </>}
            </div>}
            {(servicesQuery.isError || combosQuery.isError) && <p role="alert" className="text-sm text-destructive">Não foi possível carregar serviços e descontos. Feche e tente novamente.</p>}
            {payError && <p role="alert" className="text-sm font-semibold text-destructive">{payError}</p>}
            </section>
            </div>
            </div>
            <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-5 py-4 sm:justify-end sm:px-6">
              <Button variant="outline" disabled={payBusy} onClick={() => setPaying(null)} className="h-12">Voltar</Button>
              <Button disabled={payBusy || removing || !!change.error || servicesQuery.isLoading || combosQuery.isLoading || productsQuery.isLoading || servicesQuery.isError || combosQuery.isError} onClick={confirmPayment} className="h-12 min-w-0 flex-1 whitespace-normal sm:flex-none"><Check />{payBusy ? "Salvando..." : "Confirmar pagamento"}</Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
