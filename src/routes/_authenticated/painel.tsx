import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { formatDateLong, formatTime } from "@/lib/booking";
import { getPanelAccess } from "@/lib/admin";
import { BarberDayGrid } from "@/components/app/BarberDayGrid";
import { brl, toCents } from "@/lib/finance";

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

  const appointmentsQuery = useQuery({
    queryKey: ["panel-appointments", barberFilter ?? "all"],
    enabled: access != null && !pending,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let query = supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, services_label, total_price_cents, customer_first_name, customer_last_name, services(name), barbers(name)",
        )
        .gte("starts_at", today.toISOString())
        .order("starts_at", { ascending: true });
      if (barberFilter) {
        query = query.eq("barber_id", barberFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const methodsQuery = useQuery({
    queryKey: ["panel-methods"],
    enabled: access != null && !pending,
    queryFn: async () => (await supabase.from("payment_methods").select("id, label").eq("active", true).order("sort_order")).data ?? [],
  });
  const [paying, setPaying] = useState<string | null>(null);
  const [method, setMethod] = useState("pix");
  const [discount, setDiscount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  async function setStatus(id: string, status: string) {
    if (status === "finalizado") {
      setPaying(id);
      setPayError(null);
      setDiscount("");
      setMethod(methodsQuery.data?.[0]?.id ?? "pix");
      return;
    }
    await supabase.from("appointments").update({ status }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
  }

  async function confirmPayment() {
    if (!paying) return;
    setPayBusy(true);
    setPayError(null);
    const { error } = await supabase.rpc("finalize_appointment", {
      _appointment_id: paying,
      _method: method,
      _discount_cents: toCents(discount),
    });
    setPayBusy(false);
    if (error) return setPayError(error.message || "Não foi possível finalizar.");
    setPaying(null);
    queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["fin-entries"] });
  }
  const payingItem = appointmentsQuery.data?.find((a) => a.id === paying) as { total_price_cents?: number | null } | undefined;

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Meu Painel</h1>
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

        {access != null && !pending && appointmentsQuery.data?.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-base text-foreground/80">Nenhum agendamento a partir de hoje.</p>
          </div>
        )}

        {access != null && !pending && barberFilter && <BarberDayGrid barberId={barberFilter} />}

        <div className="grid gap-3">
          {appointmentsQuery.data?.map((item) => {
            const when = new Date(item.starts_at);
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-card-foreground">
                      {item.customer_first_name} {item.customer_last_name}
                    </p>
                    <p className="text-sm text-foreground/70">
                      {item.services_label || item.services?.name} · {item.barbers?.name}
                    </p>
                    <p className="text-sm text-foreground/70">
                      {formatDateLong(when)} · {formatTime(when)} – {formatTime(new Date(item.ends_at))}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-bold text-foreground">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </div>
                {item.status === "agendado" && !previewId && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        onClick={() => setStatus(item.id, action.status)}
                        className="min-h-11 rounded-md border border-input px-2 text-xs font-semibold text-foreground"
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
      </main>
      {paying && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-3 sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-lg bg-card p-4">
            <h2 className="text-lg font-bold text-card-foreground">Finalizar e registrar pagamento</h2>
            {payingItem?.total_price_cents != null && (
              <p className="text-base text-foreground">Valor: <b>{brl(payingItem.total_price_cents - toCents(discount))}</b></p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {methodsQuery.data?.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={`min-h-12 rounded-md border px-2 text-sm font-semibold ${method === m.id ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <label className="block space-y-1 text-sm font-semibold text-foreground">
              <span>Desconto (R$, opcional)</span>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)}
                className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base" />
            </label>
            {payError && <p className="text-sm font-semibold text-destructive">{payError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaying(null)} className="min-h-12 rounded-md border border-input text-sm font-semibold">Voltar</button>
              <button type="button" disabled={payBusy} onClick={confirmPayment}
                className="min-h-12 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50">
                {payBusy ? "Salvando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
