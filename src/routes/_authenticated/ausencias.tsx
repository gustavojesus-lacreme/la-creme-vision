import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import { ABSENCE_KINDS, formatDay, todaySP, type Absence, type AbsenceKind } from "@/lib/absences";

export const Route = createFileRoute("/_authenticated/ausencias")({
  head: () => ({
    meta: [
      { title: "Ausências dos barbeiros | LA CREME BARBER" },
      { name: "description", content: "Registre férias, atestados e ausências dos barbeiros." },
      { property: "og:title", content: "Ausências dos barbeiros | LA CREME BARBER" },
      { property: "og:description", content: "Gestão de ausências da equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbsencesPage,
});

const card = "rounded-lg border border-border bg-card p-4";
const input =
  "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const label = "block space-y-1 text-sm font-semibold text-foreground";

type Conflict = { starts_at: string; customer_first_name: string; customer_last_name: string };

function AbsencesPage() {
  const qc = useQueryClient();
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;

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
    queryKey: ["admin-absences"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_absences")
        .select("id, barber_id, kind, starts_on, ends_on, note")
        .gte("ends_on", todaySP())
        .order("starts_on");
      if (error) throw error;
      return (data ?? []) as Absence[];
    },
  });

  const [barberId, setBarberId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("ferias");
  const [start, setStart] = useState(todaySP());
  const [end, setEnd] = useState(todaySP());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ name: string; list: Conflict[] } | null>(null);

  const nameOf = (id: string) => barbersQuery.data?.find((b) => b.id === id)?.name ?? "Barbeiro";

  async function save() {
    setError(null);
    setConflicts(null);
    if (!barberId) return setError("Selecione o barbeiro.");
    if (end < start) return setError("A data final deve ser igual ou posterior à data inicial.");
    setSaving(true);
    const { error: err } = await supabase
      .from("barber_absences")
      .insert({ barber_id: barberId, kind, starts_on: start, ends_on: end, note: note.trim() });
    if (err) {
      setSaving(false);
      return setError("Não foi possível salvar a ausência.");
    }
    // Agendamentos existentes no período (não são cancelados automaticamente)
    const from = new Date(`${start}T00:00:00-03:00`).toISOString();
    const to = new Date(`${end}T23:59:59-03:00`).toISOString();
    const { data } = await supabase
      .from("appointments")
      .select("starts_at, customer_first_name, customer_last_name")
      .eq("barber_id", barberId)
      .eq("status", "agendado")
      .gte("starts_at", from)
      .lte("starts_at", to)
      .order("starts_at");
    if (data && data.length > 0) setConflicts({ name: nameOf(barberId), list: data });
    setSaving(false);
    setNote("");
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
        <Link to="/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
          <ChevronLeft className="h-4 w-4" /> Configurações
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">Ausências dos barbeiros</h1>
        {adminQuery.data === false && (
          <div className={`${card} text-center text-base text-foreground/80`}>Acesso restrito ao administrador.</div>
        )}
        {isAdmin && (
          <>
            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-bold text-card-foreground">Registrar ausência</h2>
              <label className={label}>
                <span>Barbeiro</span>
                <select className={input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                  <option value="">Selecione</option>
                  {barbersQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className={label}>
                <span>Tipo de ausência</span>
                <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
                  {Object.entries(ABSENCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  <span>Data inicial</span>
                  <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label className={label}>
                  <span>Data final</span>
                  <input type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
              <label className={label}>
                <span>Observação interna (opcional)</span>
                <textarea className={`${input} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="min-h-12 w-full rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar ausência"}
              </button>
            </section>

            {conflicts && (
              <div className="rounded-lg border border-gold bg-gold/10 p-4 text-sm text-foreground">
                <p className="font-bold">Existem agendamentos conflitantes</p>
                <p className="mt-1 text-foreground/80">
                  {conflicts.name} tem {conflicts.list.length} agendamento(s) neste período. Eles não foram cancelados e
                  precisam ser resolvidos manualmente no Painel.
                </p>
                <ul className="mt-2 space-y-1">
                  {conflicts.list.map((c) => (
                    <li key={c.starts_at + c.customer_first_name} className="break-words">
                      {new Date(c.starts_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                      {" — "}{c.customer_first_name} {c.customer_last_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">Ausências atuais e futuras</h2>
              {absencesQuery.data?.length === 0 && <p className="text-base text-foreground/70">Nenhuma ausência registrada.</p>}
              <div className="grid gap-3">
                {absencesQuery.data?.map((a) => {
                  const active = a.starts_on <= today;
                  return (
                    <div key={a.id} className={card}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-base font-bold text-card-foreground">{nameOf(a.barber_id)}</p>
                          <p className="text-sm text-foreground/70">{ABSENCE_KINDS[a.kind]}</p>
                          <p className="text-sm text-foreground/70">{formatDay(a.starts_on)} a {formatDay(a.ends_on)}</p>
                          {a.note && <p className="mt-1 break-words text-sm text-foreground/60">{a.note}</p>}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${active ? "bg-gold/15 text-foreground" : "border border-border text-foreground/60"}`}>
                          {active ? "Em andamento" : "Agendada"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(a.id)}
                        className="mt-3 min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-destructive"
                      >
                        Remover ausência
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
