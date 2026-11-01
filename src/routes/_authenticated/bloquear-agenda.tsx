import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, sCard, sInput, sLabel, sBtn, hhmm } from "@/components/app/SettingsShell";
import { BlockedDatesCard } from "@/components/app/BlockedDatesCard";
import { ScheduleScope } from "@/components/app/ScheduleScope";
import { barberFullName, type ScheduleScope as Scope } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/bloquear-agenda")({
  head: () => ({
    meta: [
      { title: "Bloquear agenda | LA CREME BARBER" },
      { name: "description", content: "Bloqueie dias inteiros ou faixas de horário da barbearia em poucos toques." },
      { property: "og:title", content: "Bloquear agenda | LA CREME BARBER" },
      { property: "og:description", content: "Bloqueio rápido de datas e horários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function Page() {
  const qc = useQueryClient();
  const [day, setDay] = useState(todaySP());
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [scope, setScope] = useState<Scope>("shop");
  const [barberId, setBarberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useQuery({
    queryKey: ["quick-time-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_absences").select("id, scope, starts_on, ends_on, starts_time, ends_time, note, weekdays, barbers(name, last_name)")
        .not("starts_time", "is", null).gte("ends_on", todaySP()).order("starts_on");
      if (error) throw error;
      return (data ?? []).filter((r) => !r.weekdays);
    },
  });

  async function save() {
    setMsg(null);
    if (!day || day < todaySP()) return setMsg({ ok: false, text: "Escolha uma data de hoje em diante." });
    if (end <= start) return setMsg({ ok: false, text: "O horário final precisa ser depois do inicial." });
    if (scope === "barber" && !barberId) return setMsg({ ok: false, text: "Selecione o barbeiro." });
    setBusy(true);
    const { error } = await supabase.from("schedule_absences").insert({
      scope, barber_id: scope === "barber" ? barberId : null, kind: "ausente", starts_on: day, ends_on: day,
      starts_time: start, ends_time: end, weekdays: null, note: "Bloqueio rápido",
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Não foi possível bloquear o horário." });
    setMsg({ ok: true, text: `Bloqueado ${fmt(day)} das ${start} às ${end}.` });
    qc.invalidateQueries({ queryKey: ["quick-time-blocks"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("schedule_absences").delete().eq("id", id);
    if (error) return setMsg({ ok: false, text: "Não foi possível liberar." });
    qc.invalidateQueries({ queryKey: ["quick-time-blocks"] });
  }

  return (
    <SettingsShell title="Bloquear agenda">
      <section className={`${sCard} space-y-4`}>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand" />
          <h2 className="font-display text-lg font-bold text-card-foreground">Bloquear uma faixa de horário</h2>
        </div>
        <ScheduleScope scope={scope} barberId={barberId} onChange={(sc, id) => { setScope(sc); setBarberId(id); }} />
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
                <span className="block text-xs font-normal normal-case text-foreground/70">{r.scope === "shop" ? "Barbearia inteira" : r.scope === "team" ? "Todos os barbeiros" : r.barbers ? barberFullName(r.barbers.name, r.barbers.last_name) : "Barbeiro"}</span></p>
              <button type="button" aria-label="Liberar horário" onClick={() => remove(r.id)} className="grid h-11 w-11 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
      <BlockedDatesCard />
    </SettingsShell>
  );
}
