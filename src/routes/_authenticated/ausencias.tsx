import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import { ABSENCE_KINDS, PARTIAL_KINDS, formatDay, todaySP, type Absence, type AbsenceKind } from "@/lib/absences";

export const Route = createFileRoute("/_authenticated/ausencias")({
  head: () => ({
    meta: [
      { title: "Ausências e bloqueios | LA CREME BARBER" },
      { name: "description", content: "Registre férias, atestados, almoço, pausas e bloqueios de agenda dos barbeiros." },
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
};
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function friendlyError(msg: string) {
  if (msg.includes("Existem agendamentos") || msg.includes("sobrepõe") || msg.includes("Horário final") || msg.includes("Data final") || msg.includes("almoço"))
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
      const { data, error } = await supabase.from("barbers").select("id, name, user_id").is("archived_at", null).order("sort_order");
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
      return (data ?? []) as Row[];
    },
  });
  const settingsQuery = useQuery({
    queryKey: ["operation-settings"],
    enabled: allowed,
    queryFn: async () => (await supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle()).data,
  });

  const meQuery = useQuery({ queryKey: ["me-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const [editing, setEditing] = useState<string | null>(null);
  const [barberId, setBarberId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("almoco");
  const [start, setStart] = useState(todaySP());
  const [end, setEnd] = useState(todaySP());
  const [partial, setPartial] = useState(true);
  const [tStart, setTStart] = useState("12:00");
  const [tEnd, setTEnd] = useState("14:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [lStart, setLStart] = useState("");
  const [lEnd, setLEnd] = useState("");
  const [lMsg, setLMsg] = useState<string | null>(null);
  useEffect(() => {
    setLStart(hhmm(settingsQuery.data?.lunch_start ?? null));
    setLEnd(hhmm(settingsQuery.data?.lunch_end ?? null));
  }, [settingsQuery.data]);

  const barberOf = (id: string) => barbersQuery.data?.find((b) => b.id === id);
  const nameOf = (id: string) => barberOf(id)?.name ?? "Você";
  const who = (uid: string | null, barberIdOf: string) => {
    if (!uid) return "—";
    if (ownBarberId) return uid === meQuery.data ? "Você" : "Administração";
    return barberOf(barberIdOf)?.user_id === uid ? "Próprio barbeiro" : "Administração";
  };

  function changeKind(k: AbsenceKind) {
    setKind(k);
    if (!editing) setPartial(PARTIAL_KINDS.includes(k));
  }

  function resetForm() {
    setEditing(null);
    setNote("");
    setError(null);
  }

  function startEdit(a: Row) {
    setEditing(a.id);
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
    if (!target) return setError("Selecione o barbeiro.");
    if (end < start) return setError("A data final deve ser igual ou posterior à data inicial.");
    if (partial && tEnd <= tStart) return setError("O horário final deve ser depois do horário inicial.");
    setSaving(true);
    const payload = {
      barber_id: target,
      kind,
      starts_on: start,
      ends_on: end,
      starts_time: partial ? tStart : null,
      ends_time: partial ? tEnd : null,
      note: note.trim(),
    };
    const { error: err } = editing
      ? await supabase.from("barber_absences").update(payload).eq("id", editing)
      : await supabase.from("barber_absences").insert(payload);
    setSaving(false);
    if (err) return setError(friendlyError(err.message));
    setOk(editing ? "Bloqueio atualizado." : "Bloqueio salvo. Esses horários não aparecem mais para clientes.");
    resetForm();
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este bloqueio? Os horários voltam a ficar disponíveis.")) return;
    await supabase.from("barber_absences").delete().eq("id", id);
    if (editing === id) resetForm();
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
  }

  async function saveLunch() {
    setLMsg(null);
    const { error: err } = await supabase
      .from("operation_settings")
      .update({ lunch_start: lStart || null, lunch_end: lEnd || null })
      .eq("id", 1);
    setLMsg(err ? friendlyError(err.message) : "Almoço padrão salvo.");
    qc.invalidateQueries({ queryKey: ["operation-settings"] });
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
          {isAdmin ? "Ausências e bloqueios" : "Bloquear minha agenda"}
        </h1>
        {access !== undefined && !allowed && (
          <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito.</div>
        )}
        {allowed && (
          <>
            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">{editing ? "Editar bloqueio" : "+ Bloquear agenda"}</h2>
              {isAdmin && (
                <label className={label}>
                  <span>Barbeiro</span>
                  <select className={input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                    <option value="">Selecione</option>
                    {barbersQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
              <label className={label}>
                <span>Tipo</span>
                <select className={input} value={kind} onChange={(e) => changeKind(e.target.value as AbsenceKind)}>
                  <optgroup label="Pausas">
                    {PARTIAL_KINDS.map((k) => <option key={k} value={k}>{ABSENCE_KINDS[k]}</option>)}
                  </optgroup>
                  <optgroup label="Ausências">
                    {(Object.keys(ABSENCE_KINDS) as AbsenceKind[]).filter((k) => !PARTIAL_KINDS.includes(k)).map((k) => (
                      <option key={k} value={k}>{ABSENCE_KINDS[k]}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  <span>Data inicial</span>
                  <input type="date" className={input} value={start} min={editing ? undefined : today} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
                </label>
                <label className={label}>
                  <span>Data final</span>
                  <input type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPartial(false)}
                  className={`min-h-12 rounded-md border px-2 text-sm font-semibold ${!partial ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                  Dia inteiro
                </button>
                <button type="button" onClick={() => setPartial(true)}
                  className={`min-h-12 rounded-md border px-2 text-sm font-semibold ${partial ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                  Só um horário
                </button>
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
              {kind === "almoco" && (
                <p className="text-xs text-foreground/60">Seu almoço neste dia substitui o almoço padrão da barbearia. O cliente não vê “Almoço”, apenas não recebe esses horários.</p>
              )}
              <label className={label}>
                <span>Observação interna (opcional)</span>
                <textarea className={`${input} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {error && <p className="rounded-md border border-gold bg-gold/10 p-3 text-sm font-semibold text-foreground">{error}</p>}
              {ok && <p className="text-sm font-semibold text-brand">{ok}</p>}
              <div className="flex gap-2">
                {editing && (
                  <button type="button" onClick={resetForm} className="min-h-12 flex-1 rounded-md border border-input px-4 text-base font-semibold text-foreground">
                    Cancelar
                  </button>
                )}
                <button type="button" disabled={saving} onClick={save}
                  className="min-h-12 flex-1 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50">
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Confirmar bloqueio"}
                </button>
              </div>
            </section>

            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">Almoço padrão da barbearia</h2>
              {isAdmin ? (
                <>
                  <p className="text-sm text-foreground/70">Aplicado a todos os barbeiros, exceto nos dias em que o barbeiro registrar o próprio almoço. Deixe em branco para não usar.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={label}><span>Início</span><input type="time" className={input} value={lStart} onChange={(e) => setLStart(e.target.value)} /></label>
                    <label className={label}><span>Fim</span><input type="time" className={input} value={lEnd} onChange={(e) => setLEnd(e.target.value)} /></label>
                  </div>
                  {lMsg && <p className="text-sm font-semibold text-foreground">{lMsg}</p>}
                  <button type="button" onClick={saveLunch} className="min-h-12 w-full rounded-md border border-brand px-4 text-base font-bold text-brand">Salvar almoço padrão</button>
                </>
              ) : (
                <p className="text-sm text-foreground/70">
                  {settingsQuery.data?.lunch_start
                    ? `${hhmm(settingsQuery.data.lunch_start)} às ${hhmm(settingsQuery.data.lunch_end ?? null)}. Para outro horário num dia, registre um bloqueio do tipo Almoço.`
                    : "Não definido pela administração."}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">Atuais e futuros</h2>
              {absencesQuery.data?.length === 0 && <p className="text-base text-foreground/70">Nenhum bloqueio registrado.</p>}
              <div className="grid gap-3">
                {absencesQuery.data?.map((a) => {
                  const active = a.starts_on <= today;
                  return (
                    <div key={a.id} className={`${card} ${editing === a.id ? "border-brand" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isAdmin && <p className="text-base font-bold text-card-foreground">{nameOf(a.barber_id)}</p>}
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
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => startEdit(a)} className="min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground">
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(a.id)} className="min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-destructive">
                          Remover
                        </button>
                      </div>
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
