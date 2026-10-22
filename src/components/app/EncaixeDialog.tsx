import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { appliedServicePrices, calculateTotals, formatPrice, formatTime, isServiceBlocked, toDateInputValue } from "@/lib/booking";

const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground";
const code5 = (n: number) => `#${String(n).padStart(5, "0")}`;
type Client = { id: string; code: number; first_name: string; last_name: string; whatsapp: string | null };

/** Agendamento avulso / encaixe: admin escolhe o barbeiro; barbeiro/líder só na própria agenda. Sempre em horários livres. */
export function EncaixeDialog({ barberId: fixedBarber, onClose, onDone }: { barberId?: string; onClose: () => void; onDone: () => void }) {
  const [client, setClient] = useState<Client | null>(null);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [whats, setWhats] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pickedBarber, setPickedBarber] = useState("");
  const barberId = fixedBarber ?? pickedBarber;
  const [day, setDay] = useState(toDateInputValue(new Date()));
  const [ids, setIds] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [manual, setManual] = useState("");
  const [encaixe, setEncaixe] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useQuery({
    queryKey: ["client-search", term.trim()],
    enabled: !client && term.trim().length >= 2,
    queryFn: async () => ((await supabase.rpc("search_clients", { _q: term.trim() })).data ?? []) as Client[],
  });

  const barbers = useQuery({
    queryKey: ["avulso-barbers"],
    enabled: !fixedBarber,
    queryFn: async () => (await supabase.from("barbers").select("id, name, last_name").eq("active", true).not("approved_at", "is", null).is("archived_at", null).order("sort_order")).data ?? [],
  });

  const data = useQuery({
    queryKey: ["encaixe-base", barberId],
    enabled: !!barberId,
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
  const appliedPrices = appliedServicePrices(selected, data.data?.combos ?? []);

  const slots = useQuery({
    queryKey: ["encaixe-slots", barberId, day, ids.join(","), totals.durationMinutes],
    enabled: !!barberId && ids.length > 0 && !!day,
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

  async function createClient() {
    setErr(null); setNotice(null);
    if (!first.trim()) return setErr("Informe o nome do cliente.");
    setBusy(true);
    const { data: rows, error } = await supabase.rpc("create_walkin_client", { _first: first, _last: last, _whatsapp: whats });
    setBusy(false);
    const r = rows?.[0];
    if (error || !r) return setErr(error?.message || "Não foi possível cadastrar.");
    setClient({ id: r.id, code: r.code, first_name: first.trim(), last_name: last.trim(), whatsapp: whats.trim() || null });
    setNotice(r.existed ? `Cliente já cadastrado (${code5(r.code)}). Usando o cadastro existente.` : `Cliente cadastrado com o código ${code5(r.code)}.`);
    setCreating(false);
  }

  async function save() {
    setErr(null);
    if (!client) return setErr("Identifique o cliente.");
    if (!barberId) return setErr("Escolha o barbeiro.");
    if (!slot) return setErr("Escolha um horário.");
    setBusy(true);
    const { error } = await supabase.rpc("staff_create_appointment", {
      _client_id: client.id, _barber_id: barberId, _starts_at: slot, _service_ids: ids,
      _label: selected.map((s) => s.name).join(" + "), _price_cents: totals.priceCents, _duration: totals.durationMinutes, _encaixe: encaixe,
    });
    setBusy(false);
    if (error) { slots.refetch(); setSlot(""); return setErr(error.message || "Não foi possível agendar."); }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-3 sm:place-items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90svh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-card p-4">
        <h2 className="text-lg font-bold text-card-foreground">Agendamento avulso</h2>
        <p className="text-xs text-foreground/60">Escolha um horário livre ou, no encaixe, digite qualquer horário.</p>

        <div className="space-y-2">
          <p className="text-sm font-semibold">1. Cliente</p>
          {client ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-brand bg-secondary p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{`${client.first_name} ${client.last_name}`.trim()}</p>
                <p className="text-xs text-foreground/70">Código: {code5(client.code)}{client.whatsapp ? ` · WhatsApp: ${client.whatsapp}` : ""}</p>
              </div>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => { setClient(null); setNotice(null); }}>Trocar</button>
            </div>
          ) : creating ? (
            <div className="space-y-2">
              <input className={input} placeholder="Nome (obrigatório)" maxLength={60} value={first} onChange={(e) => setFirst(e.target.value)} />
              <input className={input} placeholder="Sobrenome (opcional)" maxLength={60} value={last} onChange={(e) => setLast(e.target.value)} />
              <input className={input} placeholder="WhatsApp (opcional)" inputMode="tel" maxLength={30} value={whats} onChange={(e) => setWhats(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="min-h-11 rounded-md border border-input text-sm font-semibold" onClick={() => setCreating(false)}>Voltar à busca</button>
                <button type="button" disabled={busy} className="min-h-11 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50" onClick={createClient}>Salvar cliente</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input className={input} placeholder="Buscar por código (#00001), WhatsApp ou nome" value={term} onChange={(e) => setTerm(e.target.value)} />
              {search.isFetching && <p className="text-sm text-foreground/60">Buscando...</p>}
              {search.data?.map((c) => (
                <button key={c.id} type="button" onClick={() => setClient(c)} className="flex w-full flex-col items-start rounded-md border border-input p-3 text-left">
                  <span className="font-semibold">{`${c.first_name} ${c.last_name}`.trim() || "Sem nome"}</span>
                  <span className="text-xs text-foreground/70">Código: {code5(c.code)}{c.whatsapp ? ` · WhatsApp: ${c.whatsapp}` : ""}</span>
                </button>
              ))}
              {term.trim().length >= 2 && search.data?.length === 0 && <p className="text-sm text-foreground/70">Nenhum cliente encontrado.</p>}
              <button type="button" className="min-h-11 w-full rounded-md border border-input text-sm font-semibold" onClick={() => { setCreating(true); setErr(null); }}>+ Cadastrar novo cliente</button>
            </div>
          )}
          {notice && <p className="text-sm text-foreground/80">{notice}</p>}
        </div>

        {client && (
          <>
            {!fixedBarber && (
              <label className="block space-y-1 text-sm font-semibold"><span>2. Barbeiro</span>
                <select className={input} value={pickedBarber} onChange={(e) => { setPickedBarber(e.target.value); setIds([]); setSlot(""); }}>
                  <option value="">Escolha o barbeiro</option>
                  {barbers.data?.map((b) => <option key={b.id} value={b.id}>{b.last_name && b.name.endsWith(b.last_name) ? b.name : `${b.name} ${b.last_name}`.trim()}</option>)}
                </select>
              </label>
            )}
            {barberId && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Serviços</p>
                <div className="grid gap-2">
                  {services.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggle(s.id)}
                      className={`flex min-h-11 items-center justify-between rounded-md border px-3 text-sm ${ids.includes(s.id) ? "border-brand bg-secondary text-brand" : "border-input"}`}>
                      <span>{s.name}</span><span>{formatPrice(appliedPrices.get(s.id) ?? s.price_cents)}</span>
                    </button>
                  ))}
                </div>
                {ids.length > 0 && <p className="text-sm font-semibold">Total: {formatPrice(totals.priceCents)} · {totals.durationMinutes} min</p>}
              </div>
            )}
            {barberId && (
              <label className="block space-y-1 text-sm font-semibold"><span>Dia</span>
                <input type="date" className={input} value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }} />
              </label>
            )}
            {barberId && ids.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {slots.isLoading && <p className="col-span-4 text-sm">Carregando...</p>}
                {slots.data?.length === 0 && <p className="col-span-4 text-sm text-foreground/70">Nenhum horário livre neste dia.</p>}
                {slots.data?.map((s) => (
                  <button key={s.starts_at} type="button" onClick={() => { setSlot(s.starts_at); setManual(""); }}
                    className={`min-h-11 rounded-md border text-sm font-semibold ${slot === s.starts_at ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                    {formatTime(new Date(s.starts_at))}
                  </button>
                ))}
              </div>
            )}
            {barberId && ids.length > 0 && encaixe && (
              <label className="block space-y-1 text-sm font-semibold"><span>Ou digite um horário (encaixe)</span>
                <input type="time" className={input} value={manual} onChange={(e) => {
                  setManual(e.target.value);
                  setSlot(e.target.value ? new Date(`${day}T${e.target.value}:00-03:00`).toISOString() : "");
                }} />
              </label>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} />
              Marcar como Avulso/Encaixe
            </label>
          </>
        )}

        {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
        <div className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-border bg-card p-4">
          <button type="button" onClick={onClose} className="min-h-12 rounded-md border border-input text-sm font-semibold">Voltar</button>
          <button type="button" disabled={busy || !client} onClick={save} className="min-h-12 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50">
            {busy ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
