import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateTotals, formatPrice, formatTime, isServiceBlocked, toDateInputValue } from "@/lib/booking";

const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground";

/** Encaixe / agendamento manual do barbeiro: só na própria agenda e em horários livres. */
export function EncaixeDialog({ barberId, onClose, onDone }: { barberId: string; onClose: () => void; onDone: () => void }) {
  const [day, setDay] = useState(toDateInputValue(new Date()));
  const [ids, setIds] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [whats, setWhats] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = useQuery({
    queryKey: ["encaixe-base", barberId],
    queryFn: async () => {
      const [b, s, c] = await Promise.all([
        supabase.from("barbers").select("service_ids").eq("id", barberId).maybeSingle(),
        supabase.from("services").select("id, name, price_cents, duration_minutes").eq("active", true).order("sort_order"),
        supabase.from("service_combos").select("id, name, service_ids, price_cents, duration_minutes, item_prices").eq("active", true),
      ]);
      const allowed = b.data?.service_ids ?? [];
      return { services: (s.data ?? []).filter((x) => allowed.includes(x.id)), combos: (c.data ?? []) as never[] };
    },
  });
  const services = data.data?.services ?? [];
  const selected = services.filter((s) => ids.includes(s.id));
  const totals = calculateTotals(selected, data.data?.combos ?? []);

  const slots = useQuery({
    queryKey: ["encaixe-slots", barberId, day, ids.join(","), totals.durationMinutes],
    enabled: ids.length > 0 && !!day,
    queryFn: async () =>
      (await supabase.rpc("get_available_slots", { _barber_id: barberId, _day: day, _duration: totals.durationMinutes, _service_ids: ids })).data ?? [],
  });

  function toggle(id: string) {
    setSlot("");
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const sel = services.filter((s) => next.includes(s.id));
      return next.filter((x) => { const s = services.find((a) => a.id === x); return !s || !isServiceBlocked(s, sel); });
    });
  }

  async function save() {
    setErr(null);
    if (!first.trim() || !whats.trim()) return setErr("Informe nome e WhatsApp do cliente.");
    if (!slot) return setErr("Escolha um horário.");
    setBusy(true);
    const { error } = await supabase.rpc("barber_create_appointment", {
      _starts_at: slot, _service_ids: ids, _first: first, _last: last, _whatsapp: whats,
      _label: selected.map((s) => s.name).join(" + "), _price_cents: totals.priceCents, _duration: totals.durationMinutes,
    });
    setBusy(false);
    if (error) { slots.refetch(); setSlot(""); return setErr(error.message || "Não foi possível agendar."); }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-3 sm:place-items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90svh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-card p-4">
        <h2 className="text-lg font-bold text-card-foreground">Encaixe / agendamento manual</h2>
        <p className="text-xs text-foreground/60">Somente na sua agenda e em horários livres.</p>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Cliente novo ou presencial</p>
          <input className={input} placeholder="Nome" value={first} onChange={(e) => setFirst(e.target.value)} />
          <input className={input} placeholder="Sobrenome" value={last} onChange={(e) => setLast(e.target.value)} />
          <input className={input} placeholder="WhatsApp" inputMode="tel" value={whats} onChange={(e) => setWhats(e.target.value)} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Serviços</p>
          <div className="grid gap-2">
            {services.map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(s.id)}
                className={`flex min-h-11 items-center justify-between rounded-md border px-3 text-sm ${ids.includes(s.id) ? "border-brand bg-secondary text-brand" : "border-input"}`}>
                <span>{s.name}</span><span>{formatPrice(s.price_cents)}</span>
              </button>
            ))}
          </div>
          {ids.length > 0 && <p className="text-sm font-semibold">Total: {formatPrice(totals.priceCents)} · {totals.durationMinutes} min</p>}
        </div>
        <label className="block space-y-1 text-sm font-semibold"><span>Dia</span>
          <input type="date" className={input} value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }} />
        </label>
        {ids.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {slots.isLoading && <p className="col-span-4 text-sm">Carregando...</p>}
            {slots.data?.length === 0 && <p className="col-span-4 text-sm text-foreground/70">Nenhum horário livre neste dia.</p>}
            {slots.data?.map((s) => (
              <button key={s.starts_at} type="button" onClick={() => setSlot(s.starts_at)}
                className={`min-h-11 rounded-md border text-sm font-semibold ${slot === s.starts_at ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                {formatTime(new Date(s.starts_at))}
              </button>
            ))}
          </div>
        )}
        {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
        <div className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-border bg-card p-4">
          <button type="button" onClick={onClose} className="min-h-12 rounded-md border border-input text-sm font-semibold">Voltar</button>
          <button type="button" disabled={busy} onClick={save} className="min-h-12 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50">
            {busy ? "Salvando..." : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
