import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
  const [msg, setMsg] = useState<{ day: number; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<number, { o: string; c: string }>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["config-hours"] });
  const err = (day: number, e: { message: string } | null, okText?: string) =>
    setMsg(e ? { day, text: e.message.includes("sobrepõe") ? e.message : "Não foi possível salvar." } : okText ? { day, text: okText } : null);

  async function setOpen(day: number, open: boolean) {
    const { error } = await supabase.from("business_hours").update({ closed: !open }).eq("weekday", day);
    err(day, error);
    refresh();
  }
  async function add(day: number) {
    const d = draft[day] ?? { o: "09:00", c: "19:00" };
    if (d.c <= d.o) return setMsg({ day, text: "O fechamento deve ser depois da abertura." });
    const { error } = await supabase.from("business_periods").insert({ weekday: day, opens_at: d.o, closes_at: d.c });
    err(day, error, "Período adicionado.");
    refresh();
  }
  async function remove(day: number, id: string) {
    if (!window.confirm("Remover este período?")) return;
    const { error } = await supabase.from("business_periods").delete().eq("id", id);
    err(day, error);
    refresh();
  }

  return (
    <SettingsShell title="Horários de funcionamento">
      <p className="text-sm text-foreground/70">
        Estes horários definem os horários oferecidos aos clientes. Um serviço só aparece se couber inteiro dentro de um período.
      </p>
      <div className="grid gap-3">
        {DAYS.map(([day, name]) => {
          const closed = q.data?.hours.find((h) => h.weekday === day)?.closed ?? true;
          const periods = q.data?.periods.filter((p) => p.weekday === day) ?? [];
          const d = draft[day] ?? { o: "09:00", c: "19:00" };
          return (
            <section key={day} className={`${sCard} space-y-3`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-card-foreground">{name}</h2>
                  <p className="text-sm text-foreground/60">
                    {closed ? "Fechado" : periods.length ? periods.map((p) => `${hhmm(p.opens_at)} → ${hhmm(p.closes_at)}`).join(" · ") : "Aberto, sem períodos (sem horários)"}
                  </p>
                </div>
                <Toggle checked={!closed} onChange={(v) => setOpen(day, v)} label={`${name} aberto`} />
              </div>
              {!closed && (
                <>
                  {periods.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                      <span className="text-base font-semibold tabular-nums text-foreground">{hhmm(p.opens_at)} → {hhmm(p.closes_at)}</span>
                      <button type="button" onClick={() => remove(day, p.id)} aria-label="Remover período" className="grid min-h-11 min-w-11 place-items-center text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <label className="block min-w-0 space-y-1 text-xs font-semibold text-foreground">
                      <span>Abre</span>
                      <input type="time" className={sInput} value={d.o} onChange={(e) => setDraft({ ...draft, [day]: { ...d, o: e.target.value } })} />
                    </label>
                    <label className="block min-w-0 space-y-1 text-xs font-semibold text-foreground">
                      <span>Fecha</span>
                      <input type="time" className={sInput} value={d.c} onChange={(e) => setDraft({ ...draft, [day]: { ...d, c: e.target.value } })} />
                    </label>
                    <button type="button" onClick={() => add(day)} className={`${sBtnOutline} inline-flex items-center gap-1 px-3`} aria-label="Adicionar período">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
              {msg?.day === day && <p className="text-sm font-semibold text-foreground">{msg.text}</p>}
            </section>
          );
        })}
      </div>
    </SettingsShell>
  );
}
