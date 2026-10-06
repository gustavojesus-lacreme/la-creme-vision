import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BarberShell } from "@/components/app/BarberShell";
import { sCard, sBtn, sInput, sLabel, hhmm } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/minha-disponibilidade")({
  head: () => ({
    meta: [
      { title: "Minha disponibilidade | LA CREME BARBER" },
      { name: "description", content: "Horário de trabalho, almoço e ausências do barbeiro." },
      { property: "og:title", content: "Minha disponibilidade | LA CREME BARBER" },
      { property: "og:description", content: "Horário, almoço e ausências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BarberShell title="Minha disponibilidade" back>{(id) => <Availability barberId={id} />}</BarberShell>,
});

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const addMin = (t: string, m: number) => { const [h = 0, mi = 0] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const mins = (t: string) => { const [h = 0, m = 0] = t.split(":").map(Number); return h * 60 + m; };

function Availability({ barberId }: { barberId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-availability", barberId],
    queryFn: async () => {
      const [p, h, s, b] = await Promise.all([
        supabase.from("business_periods").select("weekday, opens_at, closes_at").order("opens_at"),
        supabase.from("business_hours").select("weekday, closed"),
        supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle(),
        supabase.from("barbers").select("lunch_start").eq("id", barberId).maybeSingle(),
      ]);
      return { periods: p.data ?? [], hours: h.data ?? [], lunch: s.data, mine: b.data?.lunch_start ?? null };
    },
  });
  const [start, setStart] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const d = q.data;
  const dur = d?.lunch?.lunch_start && d.lunch.lunch_end ? mins(hhmm(d.lunch.lunch_end)) - mins(hhmm(d.lunch.lunch_start)) : 0;
  useEffect(() => { if (d) setStart(hhmm(d.mine ?? d.lunch?.lunch_start ?? "")); }, [d]);

  async function save() {
    setMsg(null);
    const { error } = await supabase.from("barbers").update({ lunch_start: start || null }).eq("id", barberId);
    setMsg(error ? error.message : "Almoço salvo.");
    qc.invalidateQueries({ queryKey: ["my-availability"] });
    qc.invalidateQueries({ queryKey: ["barber-day"] });
  }

  return (
    <div className="space-y-4">
      <section className={`${sCard} space-y-1`}>
        <h2 className="pb-1 text-base font-bold uppercase tracking-wide text-brand">Meu horário</h2>
        <p className="pb-1 text-xs text-foreground/60">Definido pela administração (horário da barbearia).</p>
        {DAYS.map((name, wd) => {
          const closed = d?.hours.find((x) => x.weekday === wd)?.closed;
          const ps = d?.periods.filter((x) => x.weekday === wd) ?? [];
          return (
            <div key={wd} className="flex min-h-10 items-center justify-between border-t border-border text-sm first:border-t-0">
              <span className="font-semibold">{name}</span>
              <span className="text-foreground/80">{closed || ps.length === 0 ? "Folga" : ps.map((x) => `${hhmm(x.opens_at)}–${hhmm(x.closes_at)}`).join(" · ")}</span>
            </div>
          );
        })}
      </section>
      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Almoço / intervalo</h2>
        {!dur ? <p className="text-sm text-foreground/70">A administração ainda não definiu o almoço.</p> : (
          <>
            <p className="text-sm text-foreground/70">Duração definida pela administração: {dur} min. Você escolhe o horário de início, dentro do expediente.</p>
            <label className={sLabel}><span>Início do almoço</span><input type="time" className={sInput} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            {start && <p className="text-sm">Seu almoço: {start} às {addMin(start, dur)}</p>}
            {msg && <p className="text-sm font-semibold text-brand">{msg}</p>}
            <button type="button" className={`${sBtn} w-full`} onClick={save}>Salvar almoço</button>
          </>
        )}
      </section>
      <Link to="/ausencias" className={`${sCard} flex min-h-16 items-center justify-between gap-3 hover:bg-secondary/60`}>
        <span><span className="block font-semibold">Minhas ausências e bloqueios</span>
          <span className="text-sm text-foreground/65">Emergência ou afastamento médico, dia inteiro ou horário específico</span></span>
        <ChevronRight className="h-5 w-5 text-foreground/40" />
      </Link>
    </div>
  );
}
