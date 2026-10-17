import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { formatDateLong, formatPrice, formatTime } from "@/lib/booking";

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

  const appointmentsQuery = useQuery({
    queryKey: ["my-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, status, services_label, total_price_cents, total_duration_minutes, customer_first_name, customer_last_name, services(name, price_cents), barbers(name)")
        .order("starts_at", { ascending: false });
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
          const active = items.filter((item) => !isCanceled(item.status));
          const canceled = items.filter((item) => isCanceled(item.status));

          const renderCard = (item: (typeof items)[number]) => {
            const when = new Date(item.starts_at);
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
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
                  <span className="text-base font-bold text-brand">
                    {item.total_price_cents != null
                      ? formatPrice(item.total_price_cents)
                      : item.services
                        ? formatPrice(item.services.price_cents)
                        : ""}
                  </span>
                </div>
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
