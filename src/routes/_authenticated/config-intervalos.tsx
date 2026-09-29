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
  const q = useQuery({
    queryKey: ["operation-settings"],
    queryFn: async () => (await supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle()).data,
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
    const { error } = await supabase.from("operation_settings")
      .update({ lunch_start: clear ? null : s, lunch_end: clear ? null : e }).eq("id", 1);
    setMsg(error ? "Não foi possível salvar." : clear ? "Intervalo padrão removido." : "Intervalo padrão salvo.");
    qc.invalidateQueries({ queryKey: ["operation-settings"] });
  }

  return (
    <SettingsShell title="Intervalos e almoço">
      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Almoço padrão</h2>
        <p className="text-sm text-foreground/70">
          Aplicado a todos os barbeiros. Quando um barbeiro registra o próprio almoço num dia, o dele substitui o padrão naquele dia.
          O cliente não vê “Almoço”; apenas não recebe esses horários.
        </p>
        <p className="text-sm font-semibold text-foreground">
          Atual: {q.data?.lunch_start ? `${hhmm(q.data.lunch_start)} → ${hhmm(q.data.lunch_end)}` : "sem intervalo padrão"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className={sLabel}><span>Início</span><input type="time" className={sInput} value={s} onChange={(ev) => setS(ev.target.value)} /></label>
          <label className={sLabel}><span>Fim</span><input type="time" className={sInput} value={e} onChange={(ev) => setE(ev.target.value)} /></label>
        </div>
        {msg && <p className="text-sm font-semibold text-foreground">{msg}</p>}
        <button type="button" onClick={() => save()} className={`${sBtn} w-full`}>Salvar</button>
        {q.data?.lunch_start && (
          <button type="button" onClick={() => window.confirm("Remover o intervalo padrão?") && save(true)} className={`${sBtnOutline} w-full`}>
            Sem intervalo padrão
          </button>
        )}
      </section>
      <p className="text-sm text-foreground/70">
        Pausas individuais e ausências de cada barbeiro ficam em{" "}
        <Link to="/ausencias" className="font-semibold text-brand underline">Ausências dos barbeiros</Link>.
      </p>
    </SettingsShell>
  );
}
