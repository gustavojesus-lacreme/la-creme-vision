import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import {
  buildAvailableSlots,
  formatDateLong,
  formatPrice,
  formatTime,
  toDateInputValue,
  weekdayOf,
  type BusyInterval,
} from "@/lib/booking";

export const Route = createFileRoute("/agendar")({
  head: () => ({
    meta: [
      { title: "Agendar horário | LA CREME BARBER" },
      {
        name: "description",
        content: "Escolha serviço, barbeiro, data e horário disponível na LA CREME BARBER.",
      },
      { property: "og:title", content: "Agendar horário | LA CREME BARBER" },
      {
        property: "og:description",
        content: "Escolha serviço, barbeiro, data e horário disponível.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingPage,
});

const cardClass = "rounded-lg border border-border bg-card p-4";
const inputClass =
  "min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";

function BookingPage() {
  const { session } = useSession();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(() => toDateInputValue(new Date()));
  const [slot, setSlot] = useState<Date | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    when: Date;
    service: string;
    priceCents: number;
    barber: string;
    clientName: string;
  } | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("services")
        .select("id, name, description, price_cents, duration_minutes")
        .order("sort_order");
      if (err) throw err;
      return data ?? [];
    },
  });

  const barbersQuery = useQuery({
    queryKey: ["barbers"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("barbers")
        .select("id, name, specialty")
        .order("sort_order");
      if (err) throw err;
      return data ?? [];
    },
  });

  const hoursQuery = useQuery({
    queryKey: ["business_hours"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("business_hours")
        .select("weekday, opens_at, closes_at, closed");
      if (err) throw err;
      return data ?? [];
    },
  });

  const profileQuery = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      if (!session) return null;
      const { data, error: err } = await supabase
        .from("profiles")
        .select("first_name, last_name, whatsapp")
        .eq("id", session.user.id)
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  const busyQuery = useQuery({
    queryKey: ["busy", barberId, dateStr],
    enabled: !!barberId,
    queryFn: async () => {
      if (!barberId) return [] as BusyInterval[];
      const { data, error: err } = await supabase.rpc("get_busy_slots", {
        _barber_id: barberId,
        _day: dateStr,
      });
      if (err) throw err;
      return (data ?? []) as BusyInterval[];
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setFirstName((v) => v || profile.first_name);
    setLastName((v) => v || profile.last_name);
    setWhatsapp((v) => v || profile.whatsapp);
  }, [profileQuery.data]);

  useEffect(() => {
    setSlot(null);
  }, [serviceId, barberId, dateStr]);

  const service = servicesQuery.data?.find((s) => s.id === serviceId) ?? null;
  const barber = barbersQuery.data?.find((b) => b.id === barberId) ?? null;
  const dayHours = hoursQuery.data?.find((h) => h.weekday === weekdayOf(dateStr));

  const slots = useMemo(() => {
    if (!service || !dayHours || dayHours.closed || !dayHours.opens_at || !dayHours.closes_at)
      return [];
    return buildAvailableSlots({
      dateStr,
      opensAt: dayHours.opens_at,
      closesAt: dayHours.closes_at,
      durationMinutes: service.duration_minutes,
      busy: busyQuery.data ?? [],
    });
  }, [service, dayHours, dateStr, busyQuery.data]);

  const ready =
    !!service && !!barber && !!slot && firstName.trim() !== "" && whatsapp.trim() !== "";

  async function handleConfirm() {
    if (!ready || !service || !barber || !slot) return;
    setSaving(true);
    setError(null);

    const ends = new Date(slot.getTime() + service.duration_minutes * 60000);
    const { error: insertError } = await supabase.from("appointments").insert({
      user_id: session?.user.id ?? null,
      service_id: service.id,
      barber_id: barber.id,
      starts_at: slot.toISOString(),
      ends_at: ends.toISOString(),
      customer_first_name: firstName.trim(),
      customer_last_name: lastName.trim(),
      customer_whatsapp: whatsapp.trim(),
    });

    if (insertError) {
      setError("Não foi possível confirmar. Escolha outro horário e tente novamente.");
    } else {
      setConfirmed({
        when: slot,
        service: service.name,
        priceCents: service.price_cents,
        barber: barber.name,
        clientName: `${firstName.trim()}${lastName.trim() ? ` ${lastName.trim()}` : ""}`,
      });
      setSlot(null);
      busyQuery.refetch();
    }
    setSaving(false);
  }

  if (confirmed) {
    const summaryRows: Array<[string, string]> = [
      ["Cliente", confirmed.clientName],
      ["Serviço", confirmed.service],
      ["Barbeiro", confirmed.barber],
      ["Data", formatDateLong(confirmed.when)],
      ["Horário", formatTime(confirmed.when)],
      ["Valor total", formatPrice(confirmed.priceCents)],
    ];
    return (
      <div className="min-h-svh bg-background">
        <AppNav />
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
          <div className={`${cardClass} text-center`}>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand text-brand-foreground">
              <Check className="h-6 w-6" />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold text-card-foreground">
              Agendamento confirmado
            </h1>

            <dl className="mt-6 divide-y divide-border rounded-md border border-border bg-background/50 text-left">
              {summaryRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <dt className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
                    {label}
                  </dt>
                  <dd
                    className={`text-right text-base font-bold ${
                      label === "Valor total" ? "text-brand" : "text-card-foreground"
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 space-y-3">
              <Link
                to="/meus-agendamentos"
                className="flex min-h-13 w-full items-center justify-center rounded-md bg-brand px-6 text-base font-bold text-brand-foreground"
              >
                Meus agendamentos
              </Link>
              <button
                type="button"
                onClick={() => setConfirmed(null)}
                className="flex min-h-13 w-full items-center justify-center rounded-md border border-input px-6 text-base font-semibold text-foreground"
              >
                Novo agendamento
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Agendar horário</h1>

        <p className="text-base text-foreground/70">
          Cliente: <span className="font-bold text-foreground">{clientLabel}</span>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold uppercase text-brand">1. Serviço</h2>


          <div className="grid gap-2">
            {servicesQuery.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setServiceId(item.id)}
                className={`${cardClass} flex min-h-14 items-center justify-between gap-3 text-left ${
                  serviceId === item.id ? "border-brand ring-2 ring-brand/30" : ""
                }`}
              >
                <span>
                  <span className="block text-base font-bold text-card-foreground">{item.name}</span>
                  <span className="block text-sm text-foreground/70">
                    {item.duration_minutes} min
                  </span>
                </span>
                <span className="text-base font-bold text-brand">
                  {formatPrice(item.price_cents)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold uppercase text-brand">2. Barbeiro</h2>
          <div className="grid gap-2">
            {barbersQuery.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBarberId(item.id)}
                className={`${cardClass} min-h-14 text-left ${
                  barberId === item.id ? "border-brand ring-2 ring-brand/30" : ""
                }`}
              >
                <span className="block text-base font-bold text-card-foreground">{item.name}</span>
                <span className="block text-sm text-foreground/70">{item.specialty}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold uppercase text-brand">3. Data</h2>
          <input
            type="date"
            className={inputClass}
            value={dateStr}
            min={toDateInputValue(new Date())}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold uppercase text-brand">4. Horário disponível</h2>
          {!service || !barber ? (
            <p className="text-base text-foreground/70">Escolha o serviço e o barbeiro.</p>
          ) : dayHours?.closed ? (
            <p className="text-base text-foreground/70">Fechado nesta data.</p>
          ) : busyQuery.isLoading ? (
            <p className="text-base text-foreground/70">Carregando horários...</p>
          ) : slots.length === 0 ? (
            <p className="text-base text-foreground/70">Sem horários disponíveis nesta data.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((option) => {
                const label = formatTime(option);
                const selected = slot?.getTime() === option.getTime();
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSlot(option)}
                    className={`min-h-12 rounded-md border text-base font-bold ${
                      selected
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-card text-card-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </section>




        <section className={`${cardClass} space-y-2`}>
          <h2 className="font-display text-lg font-bold text-card-foreground">5. Confirmar agendamento</h2>
          <p className="text-base text-foreground/80">
            {service ? `${service.name} · ${formatPrice(service.price_cents)}` : "Serviço não escolhido"}
          </p>
          <p className="text-base text-foreground/80">
            {barber ? barber.name : "Barbeiro não escolhido"}
          </p>
          <p className="text-base text-foreground/80">
            {slot ? `${formatDateLong(slot)} às ${formatTime(slot)}` : "Horário não escolhido"}
          </p>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <button
            type="button"
            disabled={!ready || saving}
            onClick={handleConfirm}
            className="mt-2 min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground disabled:opacity-50"
          >
            Confirmar agendamento
          </button>
        </section>
      </main>
    </div>
  );
}
