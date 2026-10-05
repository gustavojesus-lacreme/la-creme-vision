import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { useSession } from "@/hooks/useSession";
import { readGuest, type GuestData } from "@/lib/guest";
import { getPanelAccess } from "@/lib/admin";
import { activeAbsence, formatDayShort, returnDay } from "@/lib/absences";
import {
  formatDateLong,
  formatPrice,
  formatTime,
  toDateInputValue,
  calculateTotals,
  appliedServicePrices,
  promoHints,
  isServiceBlocked,
  formatDuration,
  type ServiceCombo,
  weekdayOf,
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
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [guest, setGuest] = useState<GuestData | null>(null);
  const [guestChecked, setGuestChecked] = useState(false);


  const [serviceIds, setServiceIds] = useState<string[]>([]);
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
    durationMinutes: number;
    ends: Date;
    barber: string;
    clientName: string;
  } | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("services")
        .select("id, name, description, price_cents, duration_minutes")
        .eq("active", true)
        .order("sort_order");
      if (err) throw err;
      return data ?? [];
    },
  });

  const combosQuery = useQuery({
    queryKey: ["service_combos"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("service_combos")
        .select("id, name, service_ids, price_cents, duration_minutes, item_prices")
        .eq("active", true);
      if (err) throw err;
      return (data ?? []) as ServiceCombo[];
    },
  });

  const barbersQuery = useQuery({
    queryKey: ["barbers", "bookable"],
    queryFn: async () => {
      // Mesma regra de is_barber_bookable no banco: ativo, não arquivado, conta vinculada e aprovado.
      const { data, error: err } = await supabase
        .from("barbers")
        .select("id, name, service_ids")
        .eq("active", true)
        .is("archived_at", null)
        .not("user_id", "is", null)
        .not("approved_at", "is", null)
        .order("sort_order");
      if (err) throw err;
      return data ?? [];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // Só datas; tipo e observação da ausência nunca chegam ao cliente.
  const absencesQuery = useQuery({
    queryKey: ["barber-absences-public"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_barber_absences_public");
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const publicSettingsQuery = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => (await supabase.rpc("get_public_settings")).data?.[0] ?? null,
  });
  const publicInfo = publicSettingsQuery.data;

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

  const durationForSlots = calculateTotals(
    (servicesQuery.data ?? []).filter((sv) => serviceIds.includes(sv.id)),
    combosQuery.data ?? [],
  ).durationMinutes;
  // Fonte única de disponibilidade (horários, almoço, bloqueios, ausências, agenda, regras).
  const busyQuery = useQuery({
    queryKey: ["available-slots", barberId, dateStr, durationForSlots],
    enabled: !!barberId && durationForSlots > 0,
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc("get_available_slots", {
        _barber_id: barberId!,
        _day: dateStr,
        _duration: durationForSlots,
      });
      if (err) throw err;
      return (data ?? []).map((r) => new Date(r.starts_at));
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setGuest(readGuest());
    setGuestChecked(true);
  }, []);

  useEffect(() => {
    if (loading || !guestChecked) return;
    if (!session && !guest) navigate({ to: "/", replace: true });
  }, [loading, guestChecked, session, guest, navigate]);

  // Barbers land on their Panel after signing in (admins keep full access).
  const accessQuery = useQuery({
    queryKey: ["panel-access", session?.user.id],
    enabled: !!session,
    queryFn: getPanelAccess,
  });
  useEffect(() => {
    if (accessQuery.data?.role === "barbeiro" || accessQuery.data?.role === "barbeiro_pendente") navigate({ to: "/painel", replace: true });
  }, [accessQuery.data, navigate]);

  useEffect(() => {
    if (session || !guest) return;
    setFirstName((v) => v || guest.firstName);
    setLastName((v) => v || guest.lastName);
    setWhatsapp((v) => v || guest.whatsapp);
  }, [guest, session]);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setFirstName((v) => v || profile.first_name);
    setLastName((v) => v || profile.last_name);
    setWhatsapp((v) => v || profile.whatsapp);
  }, [profileQuery.data]);

  useEffect(() => {
    setSlot(null);
  }, [serviceIds, barberId, dateStr]);

  const selectedServices = (servicesQuery.data ?? []).filter((s) => serviceIds.includes(s.id));
  const totals = calculateTotals(selectedServices, combosQuery.data ?? []);
  const appliedPrices = appliedServicePrices(selectedServices, combosQuery.data ?? []);
  const hints = promoHints(servicesQuery.data ?? [], combosQuery.data ?? []);
  const service =
    selectedServices.length > 0
      ? {
          id: selectedServices[0]!.id,
          name: selectedServices.map((s) => s.name).join(" + "),
          price_cents: totals.priceCents,
          duration_minutes: totals.durationMinutes,
        }
      : null;
  const toggleService = (id: string) =>
    setServiceIds((ids) => {
      const all = servicesQuery.data ?? [];
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      const nextSel = all.filter((s) => next.includes(s.id));
      return next.filter((x) => {
        const s = all.find((a) => a.id === x);
        return !s || !isServiceBlocked(s, nextSel);
      });
    });
  // Mostra só barbeiros habilitados para TODOS os serviços selecionados.
  const compatibleBarbers = (barbersQuery.data ?? []).filter((b) =>
    serviceIds.every((id) => (b.service_ids ?? []).includes(id)),
  );
  const barber = compatibleBarbers.find((b) => b.id === barberId) ?? null;
  useEffect(() => {
    if (barberId && barbersQuery.data && !compatibleBarbers.some((b) => b.id === barberId)) setBarberId(null);
  }, [barberId, barbersQuery.data, compatibleBarbers]);
  const dayHours = hoursQuery.data?.find((h) => h.weekday === weekdayOf(dateStr));

  const slots = service ? (busyQuery.data ?? []) : [];

  const clientLabel = `${firstName} ${lastName}`.trim() || "Visitante";

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
      service_ids: serviceIds,
      services_label: service.name,
      total_price_cents: service.price_cents,
      total_duration_minutes: service.duration_minutes,
    });

    if (insertError) {
      barbersQuery.refetch();
      busyQuery.refetch();
      absencesQuery.refetch();
      setSlot(null);
      setError(
        insertError.message.includes("acabou de ficar indisponível")
          ? "Este horário acabou de ficar indisponível. Escolha outro horário."
          : "Não foi possível confirmar. Confira o barbeiro e o horário e tente novamente.",
      );
    } else {
      setConfirmed({
        when: slot,
        service: service.name,
        priceCents: service.price_cents,
        durationMinutes: service.duration_minutes,
        ends,
        barber: barber.name,
        clientName: `${firstName.trim()}${lastName.trim() ? ` ${lastName.trim()}` : ""}`,
      });
      setSlot(null);
      setServiceIds([]);
      busyQuery.refetch();
    }
    setSaving(false);
  }

  if (!session && guestChecked && !guest) return null;

  if (confirmed) {
    const summaryRows: Array<[string, string]> = [
      ["Cliente", confirmed.clientName],
      ["Serviços", confirmed.service],
      ["Barbeiro", confirmed.barber],
      ["Data", formatDateLong(confirmed.when)],
      ["Horário", `${formatTime(confirmed.when)} – ${formatTime(confirmed.ends)}`],
      ["Duração", formatDuration(confirmed.durationMinutes)],
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
            <h1 className="mt-4 font-display text-xl font-bold uppercase text-card-foreground">
              Agendamento realizado!
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
                className="flex min-h-13 w-full items-center justify-center rounded-md bg-brand px-6 text-base font-bold uppercase text-brand-foreground"
              >
                Ver meus agendamentos
              </Link>
              <button
                type="button"
                onClick={() => setConfirmed(null)}
                className="flex min-h-13 w-full items-center justify-center rounded-md border border-input px-6 text-base font-semibold uppercase text-foreground"
              >
                Voltar ao início
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
          <h2 className="text-base font-bold uppercase text-brand">1. Serviços</h2>
          <p className="text-sm text-foreground/70">Você pode escolher mais de um.</p>
          <div className="grid gap-2">
            {servicesQuery.data?.map((item) => {
              const blocked = isServiceBlocked(item, selectedServices);
              return (
              <button
                key={item.id}
                type="button"
                disabled={blocked}
                aria-pressed={serviceIds.includes(item.id)}
                onClick={() => toggleService(item.id)}
                className={`${cardClass} flex min-h-14 items-center justify-between gap-3 text-left ${
                  serviceIds.includes(item.id) ? "border-brand ring-2 ring-brand/30" : ""
                } ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <span>
                  <span className="block text-base font-bold text-card-foreground">{item.name}</span>
                  <span className="block text-sm text-foreground/70">
                    {item.duration_minutes} min
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  {blocked ? (
                    <span className="text-base font-bold text-brand">Incluído</span>
                  ) : appliedPrices.has(item.id) ? (
                    <>
                      <span className="text-sm text-foreground/50 line-through">{formatPrice(item.price_cents)}</span>
                      <span className="text-base font-bold text-brand">{formatPrice(appliedPrices.get(item.id)!)}</span>
                    </>
                  ) : !serviceIds.includes(item.id) && hints.has(item.id) ? (
                    <>
                      <span className="text-sm text-foreground/50 line-through">{formatPrice(item.price_cents)}</span>
                      <span className="text-base font-bold text-brand">{formatPrice(hints.get(item.id)!.price)}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gold">{hints.get(item.id)!.condition}</span>
                    </>
                  ) : (
                    <span className="text-base font-bold text-brand">{formatPrice(item.price_cents)}</span>
                  )}
                </span>
              </button>
              );
            })}
          </div>
          {totals.applied.length > 0 && (
            <div className="space-y-1 rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-foreground">
              {totals.applied.map((c) => {
                const original = selectedServices
                  .filter((s) => c.service_ids.includes(s.id))
                  .reduce((t, s) => t + s.price_cents, 0);
                return (
                  <p key={c.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">Preço especial · {c.name}</span>
                    <span>
                      {original !== c.price_cents && (
                        <span className="mr-2 text-foreground/50 line-through">{formatPrice(original)}</span>
                      )}
                      <span className="font-bold">{formatPrice(c.price_cents)}</span>
                    </span>
                  </p>
                );
              })}
              <p className="flex justify-between border-t border-gold/40 pt-1 font-bold">
                <span>Total</span>
                <span>{formatPrice(totals.priceCents)}</span>
              </p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold uppercase text-brand">2. Barbeiro</h2>
          {barbersQuery.data && compatibleBarbers.length === 0 && (
            <p className="text-base text-foreground/70">
              Nenhum barbeiro disponível para os serviços escolhidos.
            </p>
          )}
          <div className="grid gap-2">
            {compatibleBarbers.map((item) => {
              const away = activeAbsence(absencesQuery.data, item.id, dateStr || undefined);
              return (
              <button
                key={item.id}
                type="button"
                onClick={() => setBarberId(item.id)}
                className={`${cardClass} min-h-14 text-left ${
                  barberId === item.id ? "border-brand ring-2 ring-brand/30" : ""
                }`}
              >
                <span className="block text-base font-bold text-card-foreground">{item.name}</span>
                {away && (
                  <span className="mt-1 inline-block rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                    {`Ausente · Retorno em ${formatDayShort(returnDay(away.ends_on))}`}
                  </span>
                )}
              </button>
              );
            })}
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




        <section className={`${cardClass} space-y-3`}>
          <h2 className="font-display text-lg font-bold text-card-foreground">5. Resumo</h2>
          <dl className="divide-y divide-border rounded-md border border-border bg-background/50">
            {(
              [
                ["Cliente", clientLabel],
                ["Serviços", service ? service.name : "—"],
                ["Barbeiro", barber ? barber.name : "—"],
                ["Data", slot ? formatDateLong(slot) : "—"],
                ["Início", slot ? formatTime(slot) : "—"],
                [
                  "Término",
                  slot && service
                    ? formatTime(new Date(slot.getTime() + service.duration_minutes * 60000))
                    : "—",
                ],
                ["Duração total", service ? formatDuration(service.duration_minutes) : "—"],
                ["Valor total", service ? formatPrice(service.price_cents) : "—"],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-sm font-semibold text-foreground/60">{label}</dt>
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
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <h2 className="pt-2 font-display text-lg font-bold text-card-foreground">6. Confirmar</h2>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={handleConfirm}
            className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold uppercase text-brand-foreground disabled:opacity-50"
          >
            Confirmar agendamento
          </button>
        </section>
        {publicInfo && (publicInfo.shop_whatsapp || publicInfo.shop_email || publicInfo.shop_address || publicInfo.shop_public_info) && (
          <footer className="space-y-1 border-t border-border pt-4 text-sm text-foreground/70">
            <p className="font-bold text-foreground">{publicInfo.shop_name}</p>
            {publicInfo.shop_address && <p>{publicInfo.shop_address}</p>}
            {publicInfo.shop_whatsapp && <p>WhatsApp: {publicInfo.shop_whatsapp}</p>}
            {publicInfo.shop_email && <p>{publicInfo.shop_email}</p>}
            {publicInfo.shop_public_info && <p className="whitespace-pre-line">{publicInfo.shop_public_info}</p>}
          </footer>
        )}
      </main>
    </div>
  );
}
