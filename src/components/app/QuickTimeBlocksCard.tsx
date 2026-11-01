import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sCard, sInput, sLabel, sBtn, hhmm } from "@/components/app/SettingsShell";
import { barberFullName, type ScheduleScope as Scope } from "@/lib/schedule";

const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

/** Faixa de horário bloqueada, aplicada a quem está selecionado em "Aplicar a" na tela de horários. */
export function QuickTimeBlocksCard({ scope, barberId }: { scope: Scope; barberId: string }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(todaySP());
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const barbers = useQuery({
    queryKey: ["schedule-barbers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("barbers").select("id, name, last_name").is("archived_at", null).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const selected = barbers.data?.find((b) => b.id === barberId);
  const scopeLabel = scope === "shop" ? "Barbearia inteira"
    : scope === "team" ? "Todos os barbeiros"
    : selected ? barberFullName(selected.name, selected.last_name)
    : "Nenhum barbeiro selecionado";

  const q = useQuery({
    queryKey: ["quick-time-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_absences")
        .select("id, scope, starts_on, ends_on, starts_time, ends_time, note, weekdays, barbers(name, last_name)")
        .not("starts_time", "is", null).gte("ends_on", todaySP()).order("starts_on");
      if (error) throw error;
      return (data ?? []).filter((r) => !r.weekdays);
    },
  });

  async function save() {
    setMsg(null);
    if (!day || day < todaySP()) return setMsg({ ok: false, text: "Escolha uma data de hoje em diante." });
    if (end <= start) return setMsg({ ok: false, text: "O horário final precisa ser depois do inicial." });
    if (scope === "barber" && !barberId) return setMsg({ ok: false, text: "Selecione o barbeiro em \"Aplicar a\"." });
    setBusy(true);
    const { error } = await supabase.from("schedule_absences").insert({
      scope, barber_id: scope === "barber" ? barberId : null, kind: "ausente", starts_on: day, ends_on: day,
      starts_time: start, ends_time: end, weekdays: null, note: "Bloqueio rápido",
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Não foi possível bloquear o horário." });
    setMsg({ ok: true, text: `Bloqueado ${fmt(day)} das ${start} às ${end} para ${scopeLabel}.` });
    qc.invalidateQueries({ queryKey: ["quick-time-blocks"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("schedule_absences").delete().eq("id", id);
    if (error) return setMsg({ ok: false, text: "Não foi possível liberar." });
    qc.invalidateQueries({ queryKey: ["quick-time-blocks"] });
  }

  return (
    <section className={`${sCard} mt-6 space-y-4`}>
      <div className="flex items-center gap-2">
        <CalendarX className="h-5 w-5 text-brand" />
        <h2 className="font-display text-lg font-bold text-card-foreground">Bloquear um horário</h2>
      </div>
      <p className="text-sm text-foreground/60">
        O bloqueio vale para <span className="font-semibold text-brand">{scopeLabel}</span>
        , igual ao selecionado em "Aplicar a" acima.
      </p>
      <label className={sLabel}>Dia<input type="date" className={sInput} value={day} min={todaySP()} onChange={(e) => setDay(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={sLabel}>Das<input type="time" className={sInput} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className={sLabel}>Até<input type="time" className={sInput} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <button type="button" onClick={save} disabled={busy} className={`${sBtn} w-full`}>{busy ? "Bloqueando..." : "Bloquear horário"}</button>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-brand" : "text-destructive"}`}>{msg.text}</p>}
      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase text-brand">Horários bloqueados</h3>
        {(q.data ?? []).length === 0 ? <p className="text-sm text-foreground/60">Nenhum horário bloqueado.</p> : q.data!.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <p className="text-sm font-semibold capitalize text-card-foreground">{fmt(r.starts_on)} · {hhmm(r.starts_time)}–{hhmm(r.ends_time)}
              <span className="block text-xs font-normal normal-case text-foreground/70">
                {r.scope === "shop" ? "Barbearia inteira" : r.scope === "team" ? "Todos os barbeiros" : r.barbers ? barberFullName(r.barbers.name, r.barbers.last_name) : "Barbeiro"}
              </span>
            </p>
            <button type="button" aria-label="Liberar horário" onClick={() => remove(r.id)} className="grid h-11 w-11 place-items-center rounded-md text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
