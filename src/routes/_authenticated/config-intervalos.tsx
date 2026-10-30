import { ScheduleScope } from "@/components/app/ScheduleScope";
import { Button } from "@/components/ui/button";
import type { ScheduleScope as Scope } from "@/lib/schedule";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, hhmm, sBtn, sBtnOutline, sCard, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/config-intervalos")({
  head: () => ({
    meta: [
      { title: "Intervalos e almoço | LA CREME BARBER" },
      { name: "description", content: "Defina o almoço padrão aplicado à agenda dos barbeiros." },
      { property: "og:title", content: "Intervalos e almoço | LA CREME BARBER" },
      { property: "og:description", content: "Almoço padrão da barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BreaksPage,
});

function BreaksPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("shop");
  const [barberId, setBarberId] = useState("");
  const [saving, setSaving] = useState(false);
  const q = useQuery({
    queryKey: ["operation-settings", "scoped-lunch", scope, barberId],
    queryFn: async () => {
      const { data, error } = await supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (scope === "barber" && barberId) {
        const { data: own, error: err } = await supabase.from("barber_lunch_overrides").select("starts_time, ends_time").eq("barber_id", barberId).maybeSingle();
        if (err) throw err;
        if (own) return { lunch_start: own.starts_time, lunch_end: own.ends_time };
      }
      return data;
    },
  });
  const [s, setS] = useState("");
  const [e, setE] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setS(hhmm(q.data?.lunch_start));
    setE(hhmm(q.data?.lunch_end));
  }, [q.data]);

  async function save(clear = false) {
    setMsg(null);
    if (!clear && (!s || !e)) return setMsg("Informe início e fim, ou use “Sem intervalo padrão”.");
    if (!clear && e <= s) return setMsg("O fim deve ser depois do início.");
    if (scope === "barber" && !barberId) return setMsg("Selecione o barbeiro.");
    setSaving(true);
    const { error } = await supabase.rpc("save_scoped_lunch", { _scope: scope, _barber: barberId || "00000000-0000-0000-0000-000000000000", _start: clear ? "00:00" : s, _end: clear ? "00:00" : e });
    setSaving(false);
    setMsg(error ? error.message : clear ? "Intervalo padrão removido." : "Intervalo padrão salvo.");
    qc.invalidateQueries({ queryKey: ["operation-settings"] });
  }

  return (
    <SettingsShell title="Intervalos e almoço">
      <ScheduleScope scope={scope} barberId={barberId} disabled={saving} onChange={(next, id) => { setScope(next); setBarberId(id); setMsg(null); }} />
      <section className="space-y-3">
        <h2 className="text-base font-bold text-card-foreground">Almoço</h2>
        <p className="text-sm font-semibold text-foreground">
          Atual: {q.data?.lunch_start ? `${hhmm(q.data.lunch_start)} → ${hhmm(q.data.lunch_end)}` : "sem intervalo padrão"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className={sLabel}><span>Início</span><input type="time" className={sInput} value={s} onChange={(ev) => setS(ev.target.value)} /></label>
          <label className={sLabel}><span>Fim</span><input type="time" className={sInput} value={e} onChange={(ev) => setE(ev.target.value)} /></label>
        </div>
        {msg && <p className="text-sm font-semibold text-foreground">{msg}</p>}
        <Button variant="ghost" disabled={saving} type="button" onClick={() => save()} className={`${sBtn} w-full`}>Salvar</Button>
        {q.data?.lunch_start && (
          <Button variant="ghost" disabled={saving} type="button" onClick={() => window.confirm("Remover o intervalo padrão?") && save(true)} className={`${sBtnOutline} w-full`}>
            Sem intervalo padrão
          </Button>
        )}
      </section>
      <p className="text-sm text-foreground/70">
        Pausas individuais e ausências de cada barbeiro ficam em{" "}
        <Link to="/ausencias" className="font-semibold text-brand underline">Ausências dos barbeiros</Link>.
      </p>
    </SettingsShell>
  );
}
