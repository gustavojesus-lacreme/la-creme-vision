import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { formatDateLong, formatPrice, formatTime } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { chronological } from "@/lib/appointment-order";

export const Route = createFileRoute("/_authenticated/meus-agendamentos")({
  head: () => ({
    meta: [
      { title: "Meus agendamentos | LA CREME BARBER" },
      { name: "description", content: "Veja e cancele seus horários na LA CREME BARBER." },
      { property: "og:title", content: "Meus agendamentos | LA CREME BARBER" },
      { property: "og:description", content: "Veja e cancele seus horários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAppointments,
});

function MyAppointments() {
  const queryClient = useQueryClient();
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; first: string; last: string; day: string; time: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const managerQuery = useQuery({
    queryKey: ["appointment-edit-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("barbers").select("id");
      if (error) throw error;
      const allowed = await Promise.all((data ?? []).map(async (b) => {
        const { data: ok, error: err } = await supabase.rpc("can_edit_appointment", { _barber_id: b.id });
        if (err) throw err;
        return ok ? b.id : null;
      }));
      return allowed.filter((id): id is string => id !== null);
    },
  });
  async function saveEdit() {
    if (!edit) return;
    setEditBusy(true); setEditError(null);
    const { error } = await supabase.rpc("edit_appointment", { _id: edit.id, _first: edit.first, _last: edit.last, _starts_at: new Date(`${edit.day}T${edit.time}:00-03:00`).toISOString() });
    setEditBusy(false);
    if (error) return setEditError(error.message);
    setEdit(null);
    await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["panel-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["barber-day"] });
  }

  const appointmentsQuery = useQuery({
    queryKey: ["my-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, barber_id, starts_at, status, services_label, total_price_cents, total_duration_minutes, customer_first_name, customer_last_name, services(name, price_cents), barbers(name)")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function cancel(id: string) {
    const { error } = await supabase.from("appointments").update({ status: "cancelado" }).eq("id", id);
    setPendingCancelId(null);
    if (error) window.alert(error.message.includes("antecedência") ? error.message : "Não foi possível cancelar. Fale com a barbearia.");
    queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Meus agendamentos</h1>

        {appointmentsQuery.isLoading && (
          <p className="text-base text-foreground/70">Carregando...</p>
        )}

        {appointmentsQuery.data?.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-base text-foreground/80">Você ainda não tem agendamentos.</p>
            <Link
              to="/agendar"
              className="mt-4 inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-bold text-brand-foreground"
            >
              Agendar horário
            </Link>
          </div>
        )}

        {(() => {
          const items = appointmentsQuery.data ?? [];
          // "Não compareceu" aparece para o cliente como Cancelado.
          const isCanceled = (status: string) =>
            status === "cancelado" || status === "nao_compareceu";
          const statusLabel = (status: string) =>
            status === "agendado"
              ? "Agendado"
              : status === "finalizado"
                ? "Finalizado"
                : "Cancelado";
          const active = chronological(items.filter((item) => item.status === "agendado"));
          const completed = items.filter((item) => item.status === "finalizado").reverse();
          const canceled = items.filter((item) => isCanceled(item.status));

          const renderCard = (item: (typeof items)[number]) => {
            const when = new Date(item.starts_at);
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-card-foreground">{`${item.customer_first_name} ${item.customer_last_name}`.trim() || "Cliente sem nome"}</p>
                    <p className="break-words text-sm font-semibold text-card-foreground">
                      {item.services_label || item.services?.name}
                    </p>
                    <p className="text-sm text-foreground/70">
                      {formatDateLong(when)} às {formatTime(when)}
                      {item.total_duration_minutes ? ` · ${item.total_duration_minutes} min` : ""}
                    </p>
                    <p className="text-sm text-foreground/70">{item.barbers?.name}</p>
                  </div>
                  <span className="shrink-0 text-base font-bold text-brand">
                    {item.total_price_cents != null
                      ? formatPrice(item.total_price_cents)
                      : item.services
                        ? formatPrice(item.services.price_cents)
                        : ""}
                  </span>
                </div>
                {item.status === "agendado" && managerQuery.data?.includes(item.barber_id) && (
                  <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => {
                    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.starts_at));
                    setEditError(null); setEdit({ id: item.id, first: item.customer_first_name, last: item.customer_last_name, day: parts, time: formatTime(new Date(item.starts_at)) });
                  }}><Pencil />Editar agendamento</Button>
                )}
                {item.status === "agendado" ? (
                  <button
                    type="button"
                    onClick={() => setPendingCancelId(item.id)}
                    className="mt-3 min-h-11 w-full rounded-md border border-input text-sm font-semibold text-foreground"
                  >
                    Cancelar agendamento
                  </button>
                ) : (
                  <p
                    className={`mt-3 text-sm font-semibold ${
                      isCanceled(item.status) ? "text-destructive" : "text-brand"
                    }`}
                  >
                    {statusLabel(item.status)}
                  </p>
                )}
              </div>
            );
          };

          return (
            <>
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-foreground">
                  Agendamentos atuais
                </h2>
                {active.length === 0 && !appointmentsQuery.isLoading && (
                  <p className="text-base text-foreground/70">
                    Você não tem agendamentos ativos.
                  </p>
                )}
                <div className="grid gap-3">{active.map(renderCard)}</div>
              </section>

              {completed.length > 0 && <section className="space-y-3" aria-label="Agendamentos finalizados">
                <h2 className="font-display text-lg font-bold text-foreground">Agendamentos finalizados</h2>
                <div className="grid gap-3">{completed.map(renderCard)}</div>
              </section>}

              {canceled.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-display text-lg font-bold text-foreground/70">
                    Agendamentos cancelados
                  </h2>
                  <div className="grid gap-3 opacity-80">{canceled.map(renderCard)}</div>
                </section>
              )}
            </>
          );
        })()}
      </main>

      {edit && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
        <div role="dialog" aria-modal="true" aria-label="Editar agendamento" className="w-full max-w-md space-y-3 rounded-lg bg-card p-5">
          <h2 className="text-lg font-bold">Editar agendamento</h2>
          <label className="block text-sm">Nome<input aria-label="Nome" value={edit.first} onChange={(e) => setEdit({ ...edit, first: e.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3" /></label>
          <label className="block text-sm">Sobrenome<input aria-label="Sobrenome" value={edit.last} onChange={(e) => setEdit({ ...edit, last: e.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-sm">Data<input aria-label="Data" type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-2" /></label>
            <label className="min-w-0 text-sm">Horário<input aria-label="Horário" type="time" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-2" /></label>
          </div>
          {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={editBusy} onClick={() => setEdit(null)}>Voltar</Button><Button disabled={editBusy || !edit.first.trim() || !edit.day || !edit.time} onClick={saveEdit}>{editBusy ? "Salvando..." : "Salvar alterações"}</Button></div>
        </div>
      </div>}

      {pendingCancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="font-display text-lg font-bold text-card-foreground">
              Cancelar agendamento
            </h2>
            <p className="mt-2 text-base text-foreground/80">
              Tem certeza que deseja cancelar este agendamento?
            </p>
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => cancel(pendingCancelId)}
                className="min-h-12 w-full rounded-md bg-destructive px-6 text-base font-bold text-destructive-foreground"
              >
                Sim, cancelar
              </button>
              <button
                type="button"
                onClick={() => setPendingCancelId(null)}
                className="min-h-12 w-full rounded-md border border-input px-6 text-base font-semibold text-foreground"
              >
                Não, voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
