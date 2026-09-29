import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { getPanelAccess } from "@/lib/admin";
import { ABSENCE_KINDS, formatDay, todaySP, type Absence, type AbsenceKind } from "@/lib/absences";

export const Route = createFileRoute("/_authenticated/ausencias")({
  head: () => ({
    meta: [
      { title: "Ausências e bloqueios | LA CREME BARBER" },
      { name: "description", content: "Registre férias, atestados, ausências e bloqueios de agenda dos barbeiros." },
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

type Row = Absence & { starts_time: string | null; ends_time: string | null };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

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
      const { data, error } = await supabase.from("barbers").select("id, name").is("archived_at", null).order("sort_order");
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
        .select("id, barber_id, kind, starts_on, ends_on, note, starts_time, ends_time")
        .gte("ends_on", todaySP())
        .order("starts_on");
      if (ownBarberId) q = q.eq("barber_id", ownBarberId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [barberId, setBarberId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("ausente");
  const [start, setStart] = useState(todaySP());
  const [end, setEnd] = useState(todaySP());
  const [partial, setPartial] = useState(false);
  const [tStart, setTStart] = useState("13:00");
  const [tEnd, setTEnd] = useState("15:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const nameOf = (id: string) => barbersQuery.data?.find((b) => b.id === id)?.name ?? "Você";

  async function save() {
    setError(null);
    setOk(false);
    const target = ownBarberId ?? barberId;
    if (!target) return setError("Selecione o barbeiro.");
    if (end < start) return setError("A data final deve ser igual ou posterior à data inicial.");
    if (partial && tEnd <= tStart) return setError("O horário de retorno deve ser depois do horário de saída.");
    setSaving(true);
    const { error: err } = await supabase.from("barber_absences").insert({
      barber_id: target,
      kind,
      starts_on: start,
      ends_on: end,
      starts_time: partial ? tStart : null,
      ends_time: partial ? tEnd : null,
      note: note.trim(),
    });
    setSaving(false);
    if (err) {
      return setError(
        err.message.includes("Existem agendamentos")
          ? "Existem agendamentos neste período. Resolva os agendamentos antes de bloquear este horário."
          : "Não foi possível salvar.",
      );
    }
    setNote("");
    setOk(true);
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
  }

  async function remove(id: string) {
    await supabase.from("barber_absences").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-absences"] });
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
          {isAdmin ? "Ausências dos barbeiros" : "Bloquear minha agenda"}
        </h1>
        {access !== undefined && !allowed && (
          <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito.</div>
        )}
        {allowed && (
          <>
            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">Registrar ausência ou bloqueio</h2>
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
                <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
                  {Object.entries(ABSENCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  <span>Data inicial</span>
                  <input type="date" className={input} value={start} min={today} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
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
                    <span>Saio às</span>
                    <input type="time" className={input} value={tStart} onChange={(e) => setTStart(e.target.value)} />
                  </label>
                  <label className={label}>
                    <span>Retorno às</span>
                    <input type="time" className={input} value={tEnd} onChange={(e) => setTEnd(e.target.value)} />
                  </label>
                </div>
              )}
              <label className={label}>
                <span>Observação interna (opcional)</span>
                <textarea className={`${input} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {error && <p className="rounded-md border border-gold bg-gold/10 p-3 text-sm font-semibold text-foreground">{error}</p>}
              {ok && <p className="text-sm font-semibold text-brand">Bloqueio salvo. Esses horários não aparecem mais para clientes.</p>}
              <button type="button" disabled={saving} onClick={save}
                className="min-h-12 w-full rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">Atuais e futuras</h2>
              {absencesQuery.data?.length === 0 && <p className="text-base text-foreground/70">Nenhuma ausência registrada.</p>}
              <div className="grid gap-3">
                {absencesQuery.data?.map((a) => {
                  const active = a.starts_on <= today;
                  return (
                    <div key={a.id} className={card}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isAdmin && <p className="text-base font-bold text-card-foreground">{nameOf(a.barber_id)}</p>}
                          <p className="text-sm text-foreground/70">{ABSENCE_KINDS[a.kind]}</p>
                          <p className="text-sm text-foreground/70">
                            {a.starts_on === a.ends_on ? formatDay(a.starts_on) : `${formatDay(a.starts_on)} a ${formatDay(a.ends_on)}`}
                            {a.starts_time ? ` · ${hhmm(a.starts_time)} às ${hhmm(a.ends_time)}` : " · dia inteiro"}
                          </p>
                          {a.note && <p className="mt-1 break-words text-sm text-foreground/60">{a.note}</p>}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${active ? "bg-gold/15 text-foreground" : "border border-border text-foreground/60"}`}>
                          {active ? "Em andamento" : "Agendada"}
                        </span>
                      </div>
                      <button type="button" onClick={() => remove(a.id)}
                        className="mt-3 min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-destructive">
                        Remover
                      </button>
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
