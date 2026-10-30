import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Clock, Info, MinusCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, Toggle, sCard, sInput } from "@/components/app/SettingsShell";
import { ScheduleScope } from "@/components/app/ScheduleScope";
import { Button } from "@/components/ui/button";
import type { ScheduleScope as Scope } from "@/lib/schedule";
import { BlockedDatesCard } from "@/components/app/BlockedDatesCard";

export const Route = createFileRoute("/_authenticated/config-horarios")({
  head: () => ({
    meta: [
      { title: "Horários de funcionamento | LA CREME BARBER" },
      { name: "description", content: "Configure os dias e períodos de funcionamento da barbearia." },
      { property: "og:title", content: "Horários de funcionamento | LA CREME BARBER" },
      { property: "og:description", content: "Dias e horários em que a barbearia atende." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoursPage,
});

const DAYS = [
  [1, "Segunda-feira"], [2, "Terça-feira"], [3, "Quarta-feira"], [4, "Quinta-feira"],
  [5, "Sexta-feira"], [6, "Sábado"], [0, "Domingo"],
] as const;

type Period = { o: string; c: string };
type DayState = { open: boolean; periods: Period[] };

const toHM = (t: string) => t.slice(0, 5);

function validate(periods: Period[]): string | null {
  const sorted = [...periods].sort((a, b) => a.o.localeCompare(b.o));
  for (const p of sorted) {
    if (!p.o || !p.c) return "Preencha abertura e fechamento de todos os períodos.";
    if (p.c <= p.o) return "O fechamento deve ser depois da abertura.";
  }
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i]?.o ?? "") < (sorted[i - 1]?.c ?? "")) return "Os períodos não podem se sobrepor.";
  }
  return null;
}

function summary(st: DayState) {
  if (!st.open) return "Fechado";
  if (!st.periods.length) return "Sem períodos definidos";
  const n = st.periods.length;
  return `${st.periods.map((p) => `${p.o} às ${p.c}`).join(" · ")} · ${n} ${n === 1 ? "período" : "períodos"}`;
}

const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Seletor de horário em 24h (passos de 30 min), nativo no celular e sem sobrepor outros campos. */
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = SLOTS.includes(value) || !value ? SLOTS : [...SLOTS, value].sort();
  return (
    <span className="relative block">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`${sInput} appearance-none bg-card !pl-3 !pr-9 font-semibold tabular-nums`}>
        {opts.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
    </span>
  );
}

function HoursPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("shop");
  const [barberId, setBarberId] = useState("");
  const q = useQuery({
    queryKey: ["config-hours", scope, barberId],
    queryFn: async () => {
      const [h, p, overrides] = await Promise.all([
        supabase.from("business_hours").select("weekday, closed"),
        supabase.from("business_periods").select("id, weekday, opens_at, closes_at").order("opens_at"),
        supabase.from("barber_schedule_days").select("*").eq("barber_id", barberId || "00000000-0000-0000-0000-000000000000"),
      ]);
      if (h.error || p.error || overrides.error) throw h.error ?? p.error ?? overrides.error;
      return { hours: h.data ?? [], periods: p.data ?? [], overrides: overrides.data ?? [] };
    },
  });

  const [days, setDays] = useState<Record<number, DayState>>({});
  const [saved, setSaved] = useState<Record<number, DayState>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const next: Record<number, DayState> = {};
    for (const [day] of DAYS) {
      const closed = q.data.hours.find((h) => h.weekday === day)?.closed ?? true;
      const override = scope === "barber" ? q.data.overrides.find((x) => x.weekday === day) : undefined;
      next[day] = {
        open: override ? !override.closed : !closed,
        periods: override ? override.periods as Period[] : q.data.periods.filter((p) => p.weekday === day).map((p) => ({ o: toHM(p.opens_at), c: toHM(p.closes_at) })),
      };
    }
    setDays(next);
    setSaved(next);
  }, [q.data]);

  const dirtyDays = useMemo(
    () => DAYS.map(([d]) => d).filter((d) => days[d] && JSON.stringify(days[d]) !== JSON.stringify(saved[d])),
    [days, saved],
  );
  const dirtyCount = dirtyDays.length;

  const blocker = useBlocker({ shouldBlockFn: () => dirtyCount > 0 && !saving, withResolver: true, enableBeforeUnload: dirtyCount > 0 });

  const update = (day: number, patch: Partial<DayState>) => {
    setFeedback(null);
    setErrors((e) => { const { [day]: _, ...rest } = e; return rest; });
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } as DayState }));
  };

  async function saveAll() {
    if (saving || dirtyCount === 0) return;
    if (scope === "barber" && !barberId) return setFeedback({ text: "Selecione o barbeiro.", ok: false });
    const errs: Record<number, string> = {};
    for (const d of dirtyDays) {
      const st = days[d];
      if (!st) continue;
      if (!st.open) continue;
      if (st.periods.length === 0) errs[d] = "Adicione ao menos um período ou feche o dia.";
      else { const p = validate(st.periods); if (p) errs[d] = p; }
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      setExpanded(Number(Object.keys(errs)[0]));
      setFeedback({ text: "Corrija os campos destacados antes de salvar.", ok: false });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const { error } = await supabase.rpc("save_scoped_hours", {
      _scope: scope, _barber: barberId || undefined,
      _days: dirtyDays.flatMap((d) => { const st = days[d]; return st ? [{ weekday: d, closed: !st.open, periods: st.periods }] : []; }),
    });
    const failed = error?.message ?? null;
    setSaving(false);
    if (failed) {
      setFeedback({ text: failed, ok: false });
      await qc.invalidateQueries({ queryKey: ["config-hours"] });
      return;
    }
    setSaved(days);
    setFeedback({ text: "Horários atualizados com sucesso.", ok: true });
    qc.invalidateQueries({ queryKey: ["config-hours"] });
  }

  const labelCls = "block min-w-0 space-y-1 text-xs font-medium text-foreground/70";

  return (
    <SettingsShell title="Horários de funcionamento">
      <ScheduleScope scope={scope} barberId={barberId} disabled={saving} onChange={(next, id) => {
        if (dirtyCount && !window.confirm("Descartar as alterações não salvas?")) return;
        setDays({}); setSaved({}); setFeedback(null); setScope(next); setBarberId(id);
      }} />
      {q.isLoading && <p>Carregando horários...</p>}
      {q.isError && <p className="text-destructive">Não foi possível carregar os horários.</p>}
      <div className="grid gap-3 pb-36 lg:pb-28">
        {DAYS.map(([day, name]) => {
          const st = days[day];
          if (!st) return null;
          const isOpen = expanded === day && st.open;
          const err = errors[day];
          return (
            <section key={day} className={`${sCard} !p-0 overflow-hidden ${err ? "border-destructive/60" : ""}`}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Button
                  type="button"
                  onClick={() => st.open && setExpanded(isOpen ? null : day)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  {st.open
                    ? <Clock className="h-5 w-5 shrink-0 text-gold" />
                    : <MinusCircle className="h-5 w-5 shrink-0 text-gold/70" />}
                  <span className="min-w-0">
                    <span className="block font-display text-base font-bold text-card-foreground">{name}</span>
                    {st.open && st.periods.length ? (
                      <>
                        <span className="block text-sm tabular-nums text-foreground/65">{st.periods.map((p) => `${p.o} às ${p.c}`).join(" · ")}</span>
                        <span className="block text-sm text-foreground/55">{st.periods.length} {st.periods.length === 1 ? "período" : "períodos"}</span>
                      </>
                    ) : <span className="block text-sm text-foreground/60">{summary(st)}</span>}
                  </span>
                </Button>
                <Toggle
                  checked={st.open}
                  onChange={(v) => { update(day, { open: v, periods: v && st.periods.length === 0 ? [{ o: "09:00", c: "19:00" }] : st.periods }); if (v) setExpanded(day); }}
                  label={`${name} aberto`}
                />
                <Button
                  type="button"
                  disabled={!st.open}
                  onClick={() => setExpanded(isOpen ? null : day)}
                  aria-label={isOpen ? "Recolher" : "Expandir"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-foreground/50 disabled:opacity-30"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {isOpen && (
                <div className="space-y-3 px-3 pb-4">
                  <div className="space-y-3 rounded-lg bg-secondary/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Períodos de atendimento</p>
                    {st.periods.map((p, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-end gap-2">
                        <label className={labelCls}>
                          <span>Abre</span>
                          <TimeSelect value={p.o} onChange={(v) => update(day, { periods: st.periods.map((x, j) => (j === i ? { ...x, o: v } : x)) })} />
                        </label>
                        <label className={labelCls}>
                          <span>Fecha</span>
                          <TimeSelect value={p.c} onChange={(v) => update(day, { periods: st.periods.map((x, j) => (j === i ? { ...x, c: v } : x)) })} />
                        </label>
                        <Button type="button" aria-label="Remover período"
                          onClick={() => update(day, { periods: st.periods.filter((_, j) => j !== i) })}
                          className="grid h-12 w-11 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {st.periods.length === 0 && <p className="text-sm text-foreground/60">Nenhum período. Adicione um abaixo.</p>}
                  </div>
                  <Button type="button"
                    onClick={() => { const last = st.periods[st.periods.length - 1]; update(day, { periods: [...st.periods, last ? { o: last.c, c: last.c < "19:00" ? "19:00" : last.c } : { o: "09:00", c: "19:00" }] }); }}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-brand/60 text-sm font-semibold text-brand">
                    <Plus className="h-4 w-4" /> Adicionar período
                  </Button>
                </div>
              )}
              {err && <p className="px-4 pb-3 text-sm font-semibold text-destructive">{err}</p>}
            </section>
          );
        })}
      </div>

      {scope === "shop" && <div className="pb-28"><BlockedDatesCard /></div>}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 px-4 pb-2 pt-3 backdrop-blur lg:bottom-0">
        <div className="mx-auto w-full max-w-3xl space-y-1.5">
          <Button type="button" onClick={saveAll} disabled={saving || dirtyCount === 0}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-base font-bold text-brand-foreground disabled:bg-muted disabled:text-foreground/40">
            {saving ? "Salvando..." : dirtyCount ? `Salvar alterações (${dirtyCount})` : "Salvar alterações"}
            {!saving && dirtyCount > 0 && <span className="h-2 w-2 rounded-full bg-gold" />}
          </Button>
          <p className={`flex items-center justify-center gap-1.5 text-xs ${feedback ? (feedback.ok ? "text-brand" : "text-destructive") : "text-foreground/60"}`}>
            {feedback ? feedback.text : dirtyCount ? (
              <><span className="h-2 w-2 rounded-full bg-gold" />{dirtyCount === 1 ? "Você tem 1 dia com alterações não salvas" : `Você tem ${dirtyCount} dias com alterações não salvas`}</>
            ) : (<><Info className="h-3.5 w-3.5" />Nenhuma alteração pendente</>)}
          </p>
        </div>
      </div>

      {blocker.status === "blocked" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
          <div className={`${sCard} w-full max-w-sm space-y-4`}>
            <p className="font-display text-lg font-bold text-card-foreground">Você tem alterações não salvas.</p>
            <div className="grid gap-2">
              <Button type="button" onClick={() => blocker.reset?.()} className="min-h-12 rounded-md bg-brand font-bold text-brand-foreground">Continuar editando</Button>
              <Button type="button" onClick={() => blocker.proceed?.()} className="min-h-12 rounded-md border border-destructive/60 font-semibold text-destructive">Descartar alterações</Button>
            </div>
          </div>
        </div>
      )}
    </SettingsShell>
  );
}
