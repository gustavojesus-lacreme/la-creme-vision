import { ScheduleScope } from "@/components/app/ScheduleScope";
import { Button } from "@/components/ui/button";
import { absenceDates, barberFullName, WEEKDAYS, type ScheduleScope as Scope } from "@/lib/schedule";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import { ABSENCE_KINDS, ABSENCE_REASONS, formatDay, todaySP, type Absence, type AbsenceKind } from "@/lib/absences";

export const Route = createFileRoute("/_authenticated/ausencias")({
  head: () => ({
    meta: [
      { title: "Ausências | LA CREME BARBER" },
      { name: "description", content: "Registre ausências dos barbeiros: dia inteiro ou horário, com motivo opcional." },
      { property: "og:title", content: "Ausências e bloqueios | LA CREME BARBER" },
      { property: "og:description", content: "Gestão de ausências e bloqueios da agenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbsencesPage,
});

const card = "rounded-lg border border-border bg-card p-4";
const input =
  "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const label = "block min-w-0 space-y-1 text-sm font-semibold text-foreground";

type Row = Absence & {
  starts_time: string | null;
  ends_time: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  scope?: Scope;
  weekdays?: number[] | null;
  recurring?: boolean;
};
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function friendlyError(msg: string) {
  if (msg.includes("sobrepõe") || msg.includes("Horário final") || msg.includes("Data final") || msg.includes("férias"))
    return msg;
  return "Não foi possível salvar.";
}

function AbsencesPage() {
  const qc = useQueryClient();
  const accessQuery = useQuery({ queryKey: ["panel-access-ausencias"], queryFn: getPanelAccess });
  const access = accessQuery.data;
  const isAdmin = access?.role === "admin";
  const ownBarberId = access?.role === "barbeiro" ? access.barberId : null;
  const allowed = isAdmin || !!ownBarberId;

  const barbersQuery = useQuery({
    queryKey: ["absence-barbers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("barbers").select("id, name, last_name, user_id").is("archived_at", null).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const absencesQuery = useQuery({
    queryKey: ["admin-absences", ownBarberId],
    enabled: allowed,
    queryFn: async () => {
      let q = supabase
        .from("barber_absences")
        .select("id, barber_id, kind, starts_on, ends_on, note, starts_time, ends_time, created_by, updated_by, created_at, updated_at")
        .gte("ends_on", todaySP())
        .order("starts_on")
        .order("starts_time");
      if (ownBarberId) q = q.eq("barber_id", ownBarberId);
      const { data, error } = await q;
      if (error) throw error;
      const { data: rules, error: ruleError } = await supabase.from("schedule_absences").select("*").gte("ends_on", todaySP()).order("starts_on");
      if (ruleError) throw ruleError;
      const recurring = (rules ?? []).map((r) => ({ ...r, barber_id: r.barber_id ?? "", updated_by: null, updated_at: r.created_at, recurring: true })) as Row[];
      return [...(data ?? []) as Row[], ...recurring].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    },
  });
  const settingsQuery = useQuery({
    queryKey: ["operation-settings"],
    enabled: allowed,
    queryFn: async () => (await supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle()).data,
  });

  const meQuery = useQuery({ queryKey: ["me-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const [scope, setScope] = useState<Scope>("barber");
  const [weekly, setWeekly] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [editingRule, setEditingRule] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [barberId, setBarberId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("ausente");
  const periodsQuery = useQuery({
    queryKey: ["business-periods-view"],
    enabled: !!ownBarberId,
    queryFn: async () => (await supabase.from("business_periods").select("weekday, opens_at, closes_at").order("weekday").order("opens_at")).data ?? [],
  });
  const kindValue: AbsenceKind = !isAdmin && !editing && (kind === "ausente" || kind === "ferias") ? "emergencia" : kind;
  const [start, setStart] = useState(todaySP());
  const [end, setEnd] = useState(todaySP());
  const [partial, setPartial] = useState(false);
  const [tStart, setTStart] = useState("12:00");
  const [tEnd, setTEnd] = useState("14:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const barberOf = (id: string) => barbersQuery.data?.find((b) => b.id === id);
  const nameOf = (id: string) => barberOf(id) ? barberFullName(barberOf(id)?.name ?? "", barberOf(id)?.last_name) : "Você";
  const who = (uid: string | null, barberIdOf: string) => {
    if (!uid) return "—";
    if (ownBarberId) return uid === meQuery.data ? "Você" : "Administração";
    return barberOf(barberIdOf)?.user_id === uid ? "Próprio barbeiro" : "Administração";
  };


  function resetForm() {
    setEditing(null);
    setEditingRule(false);
    setNote("");
    setError(null);
  }

  function startEdit(a: Row) {
    setEditing(a.id);
    setEditingRule(!!a.recurring);
    setScope(a.scope ?? "barber");
    setWeekly(!!a.weekdays);
    setWeekdays(a.weekdays ?? []);
    setBarberId(a.barber_id);
    setKind(a.kind);
    setStart(a.starts_on);
    setEnd(a.ends_on);
    setPartial(!!a.starts_time);
    if (a.starts_time) {
      setTStart(hhmm(a.starts_time));
      setTEnd(hhmm(a.ends_time));
    }
    setNote(a.note);
    setError(null);
    setOk(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setError(null);
    setOk(null);
    const target = ownBarberId ?? barberId;
    if ((!isAdmin || scope === "barber") && !target) return setError("Selecione o barbeiro.");
    const dates = absenceDates(start, weekly ? end : start, weekly ? weekdays : null);
    if (!dates.length) return setError("Selecione os dias da semana dentro do período.");
    if (weekly && new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime() > 366 * 86400000) return setError("Escolha um período de até um ano.");
    if (end < start) return setError("A data final deve ser igual ou posterior à data inicial.");
    if (partial && tEnd <= tStart) return setError("O horário final deve ser depois do horário inicial.");
    setSaving(true);
    // Conflitos: não cancela nada, apenas avisa.
    let conflictQuery = supabase.from("appointments").select("starts_at, ends_at").eq("status", "agendado");
    if (ownBarberId || scope === "barber") conflictQuery = conflictQuery.eq("barber_id", target);
    const { data: clash } = await conflictQuery
      .gte("starts_at", new Date(`${start}T00:00:00-03:00`).toISOString())
      .lt("starts_at", new Date(new Date(`${end}T00:00:00-03:00`).getTime() + 86400000).toISOString())
      .order("starts_at");
    const hm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    const dm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));
    const conflicts = (clash ?? []).filter((a) => dates.includes(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(a.starts_at))) && (!partial || (hm(a.starts_at) < tEnd && hm(a.ends_at) > tStart)));
    const conflictText = conflicts.map((a) => `${dm(a.starts_at)} ${hm(a.starts_at)}–${hm(a.ends_at)}`).join(", ");
    if (conflicts.length && !window.confirm(`Existem ${conflicts.length} agendamento(s) neste período (${conflictText}). Eles NÃO serão cancelados automaticamente e precisarão ser resolvidos manualmente. Salvar a ausência mesmo assim?`)) {
      setSaving(false);
      return;
    }
    const payload = {
      barber_id: target,
      kind: kindValue,
      starts_on: start,
      ends_on: weekly ? end : start,
      starts_time: partial ? tStart : null,
      ends_time: partial ? tEnd : null,
      note: note.trim(),
    };
    const useRule = !editing || editingRule;
    const scopedPayload = { ...payload, barber_id: scope === "barber" || ownBarberId ? target : null, scope: ownBarberId ? "barber" as const : scope, weekdays: weekly ? weekdays : null };
    const { error: err } = useRule
      ? editing ? await supabase.from("schedule_absences").update(scopedPayload).eq("id", editing) : await supabase.from("schedule_absences").insert(scopedPayload)
      : await supabase.from("barber_absences").update(payload).eq("id", editing);
    setSaving(false);
    if (err) return setError(friendlyError(err.message));
    setOk(`${editing ? "Ausência atualizada." : "Ausência salva. Esses horários não aparecem mais para clientes."}${conflicts.length ? ` Atenção: ${conflicts.length} agendamento(s) em conflito para resolver (${conflictText}).` : ""}`);
    resetForm();
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
  }

  async function remove(id: string, rule = false) {
    if (!window.confirm("Remover esta ausência? Os horários voltam a ficar disponíveis.")) return;
    const { error: err } = rule ? await supabase.from("schedule_absences").delete().eq("id", id) : await supabase.from("barber_absences").delete().eq("id", id);
    if (err) return setError("Não foi possível remover a ausência.");
    if (editing === id) resetForm();
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
  }

  const today = todaySP();

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        {isAdmin && (
          <Link to="/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
            <ChevronLeft className="h-4 w-4" /> Configurações
          </Link>
        )}
        <h1 className="font-display text-2xl font-bold text-foreground">
          {isAdmin ? "Ausências dos barbeiros" : "Minha disponibilidade"}
        </h1>
        {access !== undefined && !allowed && (
          <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito.</div>
        )}
        {allowed && (
          <>
            {ownBarberId && (
              <section className={`${card} space-y-2`}>
                <h2 className="text-base font-bold text-card-foreground">Horário de trabalho</h2>
                <ul className="divide-y divide-border text-sm">
                  {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((d, i) => {
                    const ps = (periodsQuery.data ?? []).filter((p) => p.weekday === i);
                    return (
                      <li key={d} className="flex justify-between gap-3 py-1.5">
                        <span className="font-semibold text-foreground">{d}</span>
                        <span className="text-right text-foreground/70">{ps.length ? ps.map((p) => `${hhmm(p.opens_at)}–${hhmm(p.closes_at)}`).join(" · ") : "Fechado"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-foreground/70">
                  <span className="font-semibold text-foreground">Almoço/intervalo: </span>
                  {settingsQuery.data?.lunch_start ? `${hhmm(settingsQuery.data.lunch_start)} às ${hhmm(settingsQuery.data.lunch_end ?? null)}` : "não definido pela administração"}. Esses horários não aparecem para clientes.
                </p>
              </section>
            )}
            {ownBarberId && <h2 className="pt-2 text-lg font-bold text-foreground">Minhas ausências</h2>}
            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">{editing ? "Editar ausência" : "+ Registrar ausência"}</h2>
              {isAdmin && <ScheduleScope scope={scope} barberId={barberId} disabled={!!editing} onChange={(next, id) => { setScope(next); setBarberId(id); }} />}
              {(!editing || editingRule) && <label className={label}><span>Repetição</span><select className={input} value={weekly ? "weekly" : "once"} onChange={(e) => { setWeekly(e.target.value === "weekly"); if (e.target.value === "once") setEnd(start); }}><option value="once">Somente um dia</option><option value="weekly">Repetir semanalmente</option></select></label>}
              {weekly && <fieldset className="space-y-2"><legend className="text-sm font-semibold">Dias da semana</legend><div className="flex flex-wrap gap-3">{WEEKDAYS.map((day, i) => <label key={day} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => setWeekdays((prev) => e.target.checked ? [...prev, i] : prev.filter((d) => d !== i))} />{day}</label>)}</div></fieldset>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  <span>Data inicial</span>
                  <input type="date" className={input} value={start} min={editing ? undefined : today} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
                </label>
                {weekly && <label className={label}>
                  <span>Repetir até</span>
                  <input type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
                </label>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={() => setPartial(false)}
                  className={`min-h-12 rounded-md border px-2 text-sm font-semibold ${!partial ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                  Dia inteiro
                </Button>
                <Button type="button" onClick={() => setPartial(true)}
                  className={`min-h-12 rounded-md border px-2 text-sm font-semibold ${partial ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                  Só um horário
                </Button>
              </div>
              {partial && (
                <div className="grid grid-cols-2 gap-3">
                  <label className={label}>
                    <span>Horário inicial</span>
                    <input type="time" className={input} value={tStart} onChange={(e) => setTStart(e.target.value)} />
                  </label>
                  <label className={label}>
                    <span>Horário final</span>
                    <input type="time" className={input} value={tEnd} onChange={(e) => setTEnd(e.target.value)} />
                  </label>
                </div>
              )}
              <label className={label}>
                <span>{isAdmin ? "Motivo (opcional)" : "Motivo"}</span>
                <select className={input} value={kindValue} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
                  {ABSENCE_REASONS.filter((r) => isAdmin || r.kind === "emergencia" || r.kind === "atestado" || kindValue === r.kind).map((r) => (
                    <option key={r.kind} value={r.kind}>{r.label}</option>
                  ))}
                </select>
              </label>
              {!isAdmin && <p className="text-xs text-foreground/60">Férias são registradas pela administração. O cliente vê apenas "Ausente", nunca o motivo.</p>}
              <label className={label}>
                <span>Observação interna (opcional)</span>
                <textarea className={`${input} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {error && <p className="rounded-md border border-gold bg-gold/10 p-3 text-sm font-semibold text-foreground">{error}</p>}
              {ok && <p className="text-sm font-semibold text-brand">{ok}</p>}
              <div className="flex gap-2">
                {editing && (
                  <Button type="button" onClick={resetForm} className="min-h-12 flex-1 rounded-md border border-input px-4 text-base font-semibold text-foreground">
                    Cancelar
                  </Button>
                )}
                <Button type="button" disabled={saving} onClick={save}
                  className="min-h-12 flex-1 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50">
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar ausência"}
                </Button>
              </div>
            </section>

            {isAdmin && <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">Almoço padrão da barbearia</h2>
              {isAdmin ? (
                <p className="text-sm text-foreground/70">
                  {settingsQuery.data?.lunch_start ? `${hhmm(settingsQuery.data.lunch_start)} às ${hhmm(settingsQuery.data.lunch_end ?? null)}. ` : "Não definido. "}
                  <Link to="/config-intervalos" className="font-semibold text-brand underline">Alterar em Intervalos e almoço</Link>
                </p>
              ) : (
                <p className="text-sm text-foreground/70">
                  {settingsQuery.data?.lunch_start
                    ? `${hhmm(settingsQuery.data.lunch_start)} às ${hhmm(settingsQuery.data.lunch_end ?? null)}.`
                    : "Não definido pela administração."}
                </p>
              )}
            </section>}

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">{isAdmin ? "Atuais e futuras" : "Minhas ausências futuras"}</h2>
              {absencesQuery.data?.length === 0 && <p className="text-base text-foreground/70">Nenhuma ausência registrada.</p>}
              <div className="grid gap-3">
                {absencesQuery.data?.map((a) => {
                  const active = a.starts_on <= today;
                  return (
                    <div key={a.id} className={`${card} ${editing === a.id ? "border-brand" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isAdmin && <p className="text-base font-bold text-card-foreground">{a.scope === "shop" ? "Barbearia inteira" : a.scope === "team" ? "Todos os barbeiros" : nameOf(a.barber_id)}</p>}
                          {a.weekdays && <p className="text-sm font-semibold text-brand">Semanal · {a.weekdays.map((d) => WEEKDAYS[d]).join(", ")}</p>}
                          <p className="text-sm font-semibold text-foreground">{ABSENCE_KINDS[a.kind] ?? a.kind}</p>
                          <p className="text-sm text-foreground/70">
                            {a.starts_on === a.ends_on ? formatDay(a.starts_on) : `${formatDay(a.starts_on)} a ${formatDay(a.ends_on)}`}
                            {a.starts_time ? ` · ${hhmm(a.starts_time)} às ${hhmm(a.ends_time)}` : " · dia inteiro"}
                          </p>
                          {a.note && <p className="mt-1 break-words text-sm text-foreground/60">{a.note}</p>}
                          <p className="mt-1 text-xs text-foreground/50">
                            Criado por {who(a.created_by, a.barber_id)} em {stamp(a.created_at)}
                            {a.updated_by && ` · editado por ${who(a.updated_by, a.barber_id)} em ${stamp(a.updated_at)}`}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${active ? "border-gold/50 bg-gold/10 text-foreground" : "border-brand/30 bg-brand/10 text-brand"}`}>
                          {active ? "Em andamento" : "Programado"}
                        </span>
                      </div>
                      {(isAdmin || a.created_by === meQuery.data) && <div className="mt-3 flex gap-2">
                        <Button type="button" onClick={() => startEdit(a)} className="min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground">
                          Editar
                        </Button>
                        <Button type="button" onClick={() => remove(a.id, !!a.recurring)} className="min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-destructive">
                          Remover
                        </Button>
                      </div>}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
