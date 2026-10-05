import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, Toggle, hhmm, sBtnOutline, sCard, sInput } from "@/components/app/SettingsShell";

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

function toHM(t: string) {
  return t.slice(0, 5);
}

function validate(periods: Period[]): string | null {
  const sorted = [...periods].sort((a, b) => a.o.localeCompare(b.o));
  for (const p of sorted) {
    if (!p.o || !p.c) return "Preencha abertura e fechamento de todos os períodos.";
    if (p.c <= p.o) return "O fechamento deve ser depois da abertura.";
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].o < sorted[i - 1].c) return "Os períodos não podem se sobrepor.";
  }
  return null;
}

function HoursPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["config-hours"],
    queryFn: async () => {
      const [h, p] = await Promise.all([
        supabase.from("business_hours").select("weekday, closed"),
        supabase.from("business_periods").select("id, weekday, opens_at, closes_at").order("opens_at"),
      ]);
      return { hours: h.data ?? [], periods: p.data ?? [] };
    },
  });

  const [days, setDays] = useState<Record<number, DayState>>({});
  const [saved, setSaved] = useState<Record<number, DayState>>({});
  const [msg, setMsg] = useState<{ day: number; text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const next: Record<number, DayState> = {};
    for (const [day] of DAYS) {
      const closed = q.data.hours.find((h) => h.weekday === day)?.closed ?? true;
      next[day] = {
        open: !closed,
        periods: q.data.periods
          .filter((p) => p.weekday === day)
          .map((p) => ({ o: toHM(p.opens_at), c: toHM(p.closes_at) })),
      };
    }
    setDays(next);
    setSaved(next);
  }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["config-hours"] });

  const update = (day: number, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const isDirty = (day: number) => JSON.stringify(days[day]) !== JSON.stringify(saved[day]);

  async function save(day: number) {
    const st = days[day];
    if (!st) return;
    if (st.open) {
      if (st.periods.length === 0) {
        return setMsg({ day, text: "Adicione ao menos um período ou feche o dia.", ok: false });
      }
      const problem = validate(st.periods);
      if (problem) return setMsg({ day, text: problem, ok: false });
    }
    setSaving(day);
    setMsg(null);
    const { error: e1 } = await supabase.from("business_hours").update({ closed: !st.open }).eq("weekday", day);
    if (e1) {
      setSaving(null);
      return setMsg({ day, text: "Não foi possível salvar.", ok: false });
    }
    const { error: e2 } = await supabase.from("business_periods").delete().eq("weekday", day);
    if (e2) {
      setSaving(null);
      return setMsg({ day, text: "Não foi possível salvar os períodos.", ok: false });
    }
    if (st.open && st.periods.length > 0) {
      const rows = [...st.periods]
        .sort((a, b) => a.o.localeCompare(b.o))
        .map((p) => ({ weekday: day, opens_at: p.o, closes_at: p.c }));
      const { error: e3 } = await supabase.from("business_periods").insert(rows);
      if (e3) {
        setSaving(null);
        refresh();
        return setMsg({ day, text: e3.message.includes("sobrepõe") ? e3.message : "Não foi possível salvar os períodos.", ok: false });
      }
    }
    setSaving(null);
    setMsg({ day, text: "Configuração salva.", ok: true });
    refresh();
  }

  return (
    <SettingsShell title="Horários de funcionamento">
      <p className="text-sm text-foreground/70">
        Estes horários definem os horários oferecidos aos clientes. Faça as alterações do dia e toque em <strong>Salvar</strong> para confirmar.
      </p>
      <div className="grid gap-4">
        {DAYS.map(([day, name]) => {
          const st = days[day];
          if (!st) return null;
          const dirty = isDirty(day);
          return (
            <section key={day} className={`${sCard} space-y-4`}>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-base font-bold text-card-foreground">{name}</h2>
                  <p className="text-sm text-foreground/60">
                    {st.open
                      ? st.periods.length
                        ? st.periods.map((p) => `${hhmm(p.o)} → ${hhmm(p.c)}`).join(" · ")
                        : "Sem períodos definidos"
                      : "Fechado"}
                  </p>
                </div>
                <Toggle checked={st.open} onChange={(v) => update(day, { open: v })} label={`${name} aberto`} />
              </div>

              {st.open && (
                <div className="space-y-3">
                  {st.periods.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <label className="block min-w-0 space-y-1 text-xs font-semibold text-foreground">
                        <span>Abre</span>
                        <input
                          type="time"
                          className={sInput}
                          value={p.o}
                          onChange={(e) =>
                            update(day, { periods: st.periods.map((x, j) => (j === i ? { ...x, o: e.target.value } : x)) })
                          }
                        />
                      </label>
                      <label className="block min-w-0 space-y-1 text-xs font-semibold text-foreground">
                        <span>Fecha</span>
                        <input
                          type="time"
                          className={sInput}
                          value={p.c}
                          onChange={(e) =>
                            update(day, { periods: st.periods.map((x, j) => (j === i ? { ...x, c: e.target.value } : x)) })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => update(day, { periods: st.periods.filter((_, j) => j !== i) })}
                        aria-label="Remover período"
                        className="grid min-h-11 min-w-11 place-items-center rounded-md border border-border text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => update(day, { periods: [...st.periods, { o: "09:00", c: "19:00" }] })}
                    className={`${sBtnOutline} inline-flex w-full items-center justify-center gap-2`}
                  >
                    <Plus className="h-4 w-4" /> Adicionar período
                  </button>
                </div>
              )}

              {msg?.day === day && (
                <p className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
              )}

              {dirty && (
                <button
                  type="button"
                  disabled={saving === day}
                  onClick={() => save(day)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  {saving === day ? "Salvando…" : `Salvar ${name.split("-")[0]}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </SettingsShell>
  );
}
