import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appliedServicePrices, calculateTotals, formatPrice, formatTime, isServiceBlocked, toDateInputValue } from "@/lib/booking";

const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground";
const card = "space-y-3 rounded-lg border border-border bg-card p-4";
const code5 = (n: number) => `#${String(n).padStart(5, "0")}`;
const fullName = (b: { name: string; last_name: string }) => (b.last_name && b.name.endsWith(b.last_name) ? b.name : `${b.name} ${b.last_name}`.trim());
type Client = { id: string; code: number; first_name: string; last_name: string; whatsapp: string | null };

/** Agendamento pela equipe na tela Agendar: sempre registrado como avulso. Admin/líder podem trocar o barbeiro. */
export function StaffBooking({ ownBarberId, canChangeBarber, canCreateClient }: { ownBarberId: string | null; canChangeBarber: boolean; canCreateClient: boolean }) {
  const qc = useQueryClient();
  const [client, setClient] = useState<Client | null>(null);
  const [term, setTerm] = useState("");
  const [barberId, setBarberId] = useState(ownBarberId ?? "");
  const [day, setDay] = useState(toDateInputValue(new Date()));
  const [ids, setIds] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [manual, setManual] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [whats, setWhats] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { if (ownBarberId && !barberId) setBarberId(ownBarberId); }, [ownBarberId, barberId]);
  useEffect(() => {
    if (!client) return;
    setFirst(client.first_name); setLast(client.last_name); setWhats(client.whatsapp ?? "");
  }, [client]);

  const search = useQuery({
    queryKey: ["client-search", term.trim()],
    enabled: !client && term.trim().length >= 2,
    queryFn: async () => ((await supabase.rpc("search_clients", { _q: term.trim() })).data ?? []) as Client[],
  });
  const barbers = useQuery({
    queryKey: ["avulso-barbers"],
    queryFn: async () => (await supabase.from("barbers").select("id, name, last_name, service_ids").eq("active", true).not("approved_at", "is", null).not("user_id", "is", null).is("archived_at", null).order("sort_order")).data ?? [],
  });
  const base = useQuery({
    queryKey: ["staff-booking-base"],
    queryFn: async () => {
      const [s, c] = await Promise.all([
        supabase.from("services").select("id, name, price_cents, duration_minutes").eq("active", true).order("sort_order"),
        supabase.from("service_combos").select("id, name, service_ids, price_cents, duration_minutes, item_prices").eq("active", true),
      ]);
      return { services: s.data ?? [], combos: (c.data ?? []) as never[] };
    },
  });
  const barber = barbers.data?.find((b) => b.id === barberId);
  const services = (base.data?.services ?? []).filter((s) => !barber || (barber.service_ids ?? []).includes(s.id));
  const selected = services.filter((s) => ids.includes(s.id));
  const totals = calculateTotals(selected, base.data?.combos ?? []);
  const applied = appliedServicePrices(selected, base.data?.combos ?? []);

  const slots = useQuery({
    queryKey: ["encaixe-slots", barberId, day, ids.join(","), totals.durationMinutes],
    enabled: !!barberId && ids.length > 0 && !!day,
    queryFn: async () => (await supabase.rpc("get_available_slots", { _barber_id: barberId, _day: day, _duration: totals.durationMinutes, _service_ids: ids })).data ?? [],
  });

  function toggle(id: string) {
    setSlot(""); setManual("");
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const sel = services.filter((s) => next.includes(s.id));
      return next.filter((x) => { const s = services.find((a) => a.id === x); return !s || !isServiceBlocked(s, sel); });
    });
  }

  async function useNameOnly() {
    setErr(null);
    const [f, ...rest] = term.trim().split(/\s+/);
    setBusy(true);
    const { data: rows, error } = await supabase.rpc("create_walkin_client", { _first: f ?? "", _last: rest.join(" "), _whatsapp: "" });
    setBusy(false);
    const r = rows?.[0];
    if (error || !r) return setErr(error?.message || "Não foi possível registrar o cliente.");
    setClient({ id: r.id, code: r.code, first_name: f ?? "", last_name: rest.join(" "), whatsapp: null });
  }

  function reset() {
    setClient(null); setTerm(""); setIds([]); setSlot(""); setManual(""); setErr(null);
    setBarberId(ownBarberId ?? "");
  }

  async function save() {
    setErr(null);
    if (!client) return setErr("Identifique o cliente.");
    if (!barberId) return setErr("Escolha o barbeiro.");
    if (!ids.length) return setErr("Escolha os serviços.");
    if (!slot) return setErr("Escolha um horário.");
    if (!first.trim()) return setErr("Informe o nome do cliente.");
    if (barber && ids.some((id) => !(barber.service_ids ?? []).includes(id))) return setErr("Este barbeiro não faz um dos serviços escolhidos.");
    setBusy(true);
    const changed = first.trim() !== client.first_name || last.trim() !== client.last_name || whats.trim() !== (client.whatsapp ?? "");
    if (changed) {
      const { error } = await supabase.rpc("update_client_contact", { _client_id: client.id, _first: first, _last: last, _whatsapp: whats });
      if (error) { setBusy(false); return setErr(error.message || "Não foi possível atualizar o cliente."); }
    }
    const { error } = await supabase.rpc("staff_create_appointment", {
      _client_id: client.id, _barber_id: barberId, _starts_at: slot, _service_ids: ids,
      _label: selected.map((s) => s.name).join(" + "), _price_cents: totals.priceCents, _duration: totals.durationMinutes, _encaixe: true,
    });
    setBusy(false);
    if (error) { slots.refetch(); return setErr(error.message || "Não foi possível agendar."); }
    qc.invalidateQueries({ queryKey: ["panel-appointments"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
    setDone(`${first.trim()} ${last.trim()}`.trim() + ` · ${formatTime(new Date(slot))} com ${barber ? fullName(barber) : "barbeiro"}`);
    reset();
  }

  if (done) {
    return (
      <div className={`${card} text-center`}>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand text-brand-foreground"><Check className="h-6 w-6" /></span>
        <h2 className="font-display text-xl font-bold text-card-foreground">Agendado como avulso</h2>
        <p className="text-sm text-foreground/75">{done}</p>
        <button type="button" onClick={() => setDone(null)} className="min-h-12 w-full rounded-md bg-brand font-bold text-brand-foreground">Novo agendamento</button>
      </div>
    );
  }

  const step = "text-base font-bold uppercase text-brand";
  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className={step}>1. Cliente</h2>
        {client ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-brand bg-secondary p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{`${client.first_name} ${client.last_name}`.trim()}</p>
              <p className="text-xs text-foreground/70">Código: {code5(client.code)}{client.whatsapp ? ` · ${client.whatsapp}` : ""}</p>
            </div>
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => setClient(null)}>Trocar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className={input} placeholder="Digite nome, código ou WhatsApp" value={term} onChange={(e) => setTerm(e.target.value)} />
            {search.isFetching && <p className="text-sm text-foreground/60">Buscando...</p>}
            {search.data?.map((c) => (
              <button key={c.id} type="button" onClick={() => setClient(c)} className="flex w-full flex-col items-start rounded-md border border-input p-3 text-left">
                <span className="font-semibold">{`${c.first_name} ${c.last_name}`.trim() || "Sem nome"}</span>
                <span className="text-xs text-foreground/70">Código: {code5(c.code)}{c.whatsapp ? ` · ${c.whatsapp}` : ""}</span>
              </button>
            ))}
            {term.trim().length >= 2 && search.data?.length === 0 && !search.isFetching && <p className="text-sm text-foreground/70">Nenhum cliente encontrado.</p>}
            {canCreateClient && term.trim().length >= 2 && !/^#?\d+$/.test(term.trim()) && !search.isFetching && (
              <button type="button" disabled={busy} onClick={useNameOnly} className="min-h-11 w-full rounded-md border border-brand px-3 text-sm font-bold text-brand disabled:opacity-50">
                Usar só o nome “{term.trim()}”
              </button>
            )}
          </div>
        )}
      </section>

      {client && (
        <>
          {!barberId && (
            <section className={card}>
              <h2 className={step}>Barbeiro</h2>
              <select className={input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                <option value="">Escolha o barbeiro</option>
                {barbers.data?.map((b) => <option key={b.id} value={b.id}>{fullName(b)}</option>)}
              </select>
            </section>
          )}
          <section className={card}>
            <h2 className={step}>2. Serviços</h2>
            <div className="grid gap-2">
              {services.map((s) => {
                const blocked = isServiceBlocked(s, selected);
                return (
                  <button key={s.id} type="button" disabled={blocked} onClick={() => toggle(s.id)}
                    className={`flex min-h-12 items-center justify-between rounded-md border px-3 text-sm font-semibold ${ids.includes(s.id) ? "border-brand bg-secondary text-brand" : "border-input"} ${blocked ? "opacity-40" : ""}`}>
                    <span>{s.name}</span><span>{blocked ? "Incluído" : formatPrice(applied.get(s.id) ?? s.price_cents)}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className={card}>
            <h2 className={step}>3. Data</h2>
            <input type="date" className={input} value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); setManual(""); }} />
          </section>
          {ids.length > 0 && barberId && (
            <section className={card}>
              <h2 className={step}>4. Horário</h2>
              <div className="grid grid-cols-4 gap-2">
                {slots.isLoading && <p className="col-span-4 text-sm">Carregando...</p>}
                {slots.data?.length === 0 && <p className="col-span-4 text-sm text-foreground/70">Nenhum horário livre. Digite um horário abaixo.</p>}
                {slots.data?.map((s) => (
                  <button key={s.starts_at} type="button" onClick={() => { setSlot(s.starts_at); setManual(""); }}
                    className={`min-h-11 rounded-md border text-sm font-semibold ${slot === s.starts_at ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                    {formatTime(new Date(s.starts_at))}
                  </button>
                ))}
              </div>
              <label className="block space-y-1 text-sm font-semibold"><span>Ou digite qualquer horário (encaixe)</span>
                <input type="time" className={input} value={manual} onChange={(e) => {
                  setManual(e.target.value);
                  setSlot(e.target.value ? new Date(`${day}T${e.target.value}:00-03:00`).toISOString() : "");
                }} />
              </label>
            </section>
          )}
          {slot && (
            <section className={card}>
              <h2 className={step}>5. Confirmar</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-semibold"><span>Nome</span>
                  <input className={input} maxLength={60} value={first} onChange={(e) => setFirst(e.target.value)} /></label>
                <label className="space-y-1 text-sm font-semibold"><span>Sobrenome</span>
                  <input className={input} maxLength={60} value={last} onChange={(e) => setLast(e.target.value)} /></label>
                <label className="space-y-1 text-sm font-semibold sm:col-span-2"><span>WhatsApp (opcional)</span>
                  <input className={input} inputMode="tel" maxLength={30} placeholder="(16) 99999-0000" value={whats} onChange={(e) => setWhats(e.target.value)} /></label>
              </div>
              <p className="text-xs text-foreground/60">Alterações no nome ou WhatsApp atualizam o cadastro do cliente.</p>
              <label className="block space-y-1 text-sm font-semibold"><span>Barbeiro</span>
                {canChangeBarber ? (
                  <select className={input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                    {barbers.data?.map((b) => <option key={b.id} value={b.id}>{fullName(b)}</option>)}
                  </select>
                ) : <p className="rounded-md border border-input bg-secondary px-3 py-3">{barber ? fullName(barber) : "—"}</p>}
              </label>
              <dl className="divide-y divide-border rounded-md border border-border text-sm">
                <div className="flex justify-between p-3"><dt>Serviços</dt><dd className="text-right font-semibold">{selected.map((s) => s.name).join(" + ")}</dd></div>
                <div className="flex justify-between p-3"><dt>Horário</dt><dd className="font-semibold">{formatTime(new Date(slot))} · {totals.durationMinutes} min</dd></div>
                <div className="flex justify-between p-3"><dt>Total</dt><dd className="font-bold text-brand">{formatPrice(totals.priceCents)}</dd></div>
              </dl>
              {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
              <button type="button" disabled={busy} onClick={save} className="min-h-13 w-full rounded-md bg-brand text-base font-bold uppercase text-brand-foreground disabled:opacity-50">
                {busy ? "Salvando..." : "Confirmar agendamento"}
              </button>
            </section>
          )}
          {!slot && err && <p className="text-sm font-semibold text-destructive">{err}</p>}
        </>
      )}
    </div>
  );
}
