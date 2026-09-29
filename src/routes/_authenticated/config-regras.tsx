import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, Toggle, hhmm, sBtn, sCard, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/config-regras")({
  head: () => ({
    meta: [
      { title: "Regras de agendamento | LA CREME BARBER" },
      { name: "description", content: "Antecedência, intervalos, cancelamento e reagendamento." },
      { property: "og:title", content: "Regras de agendamento | LA CREME BARBER" },
      { property: "og:description", content: "Regras usadas pela agenda da barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));

type Form = {
  slot_step_minutes: string; min_advance_minutes: string; max_advance_days: string; tolerance_minutes: string;
  cancel_min_hours: string; reschedule_per_week: string; reschedule_fee: string; reschedule_block_saturday: boolean;
  reschedule_cutoff_weekday: string; reschedule_cutoff_time: string;
};

function Pending() {
  return <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/50">Aguardando reagendamento</span>;
}

function RulesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["booking-rules"],
    queryFn: async () => (await supabase.from("operation_settings").select("*").eq("id", 1).maybeSingle()).data,
  });
  const [f, setF] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const d = q.data;
    if (!d) return;
    setF({
      slot_step_minutes: String(d.slot_step_minutes),
      min_advance_minutes: String(d.min_advance_minutes),
      max_advance_days: d.max_advance_days == null ? "" : String(d.max_advance_days),
      tolerance_minutes: String(d.tolerance_minutes),
      cancel_min_hours: d.cancel_min_hours == null ? "" : String(d.cancel_min_hours),
      reschedule_per_week: String(d.reschedule_per_week),
      reschedule_fee: (d.reschedule_extra_fee_cents / 100).toFixed(2).replace(".", ","),
      reschedule_block_saturday: d.reschedule_block_saturday,
      reschedule_cutoff_weekday: d.reschedule_cutoff_weekday == null ? "" : String(d.reschedule_cutoff_weekday),
      reschedule_cutoff_time: hhmm(d.reschedule_cutoff_time),
    });
  }, [q.data]);

  if (!f) return <SettingsShell title="Regras de agendamento"><p className="text-base text-foreground/70">Carregando...</p></SettingsShell>;
  const set = (k: keyof Form, v: string | boolean) => setF({ ...f, [k]: v } as Form);

  async function save() {
    if (!f) return;
    setMsg(null);
    const fee = Math.round(parseFloat(f.reschedule_fee.replace(",", ".") || "0") * 100);
    const maxDays = num(f.max_advance_days);
    const { error } = await supabase.from("operation_settings").update({
      slot_step_minutes: Number(f.slot_step_minutes),
      min_advance_minutes: num(f.min_advance_minutes) ?? 0,
      max_advance_days: maxDays === 0 ? null : maxDays,
      tolerance_minutes: num(f.tolerance_minutes) ?? 0,
      cancel_min_hours: num(f.cancel_min_hours),
      reschedule_per_week: num(f.reschedule_per_week) ?? 0,
      reschedule_extra_fee_cents: Number.isFinite(fee) ? fee : 0,
      reschedule_block_saturday: f.reschedule_block_saturday,
      reschedule_cutoff_weekday: f.reschedule_cutoff_weekday === "" ? null : Number(f.reschedule_cutoff_weekday),
      reschedule_cutoff_time: f.reschedule_cutoff_time || null,
    }).eq("id", 1);
    setMsg(error ? "Não foi possível salvar. Confira os valores." : "Regras salvas e já em uso.");
    qc.invalidateQueries({ queryKey: ["booking-rules"] });
    qc.invalidateQueries({ queryKey: ["available-slots"] });
  }

  return (
    <SettingsShell title="Regras de agendamento">
      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Agendamento</h2>
        <label className={sLabel}>
          <span>Intervalo entre horários oferecidos</span>
          <select className={sInput} value={f.slot_step_minutes} onChange={(e) => set("slot_step_minutes", e.target.value)}>
            {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={sLabel}><span>Antecedência mínima (minutos)</span>
            <input inputMode="numeric" className={sInput} value={f.min_advance_minutes} onChange={(e) => set("min_advance_minutes", e.target.value)} /></label>
          <label className={sLabel}><span>Antecedência máxima (dias, vazio = sem limite)</span>
            <input inputMode="numeric" className={sInput} value={f.max_advance_days} onChange={(e) => set("max_advance_days", e.target.value)} /></label>
        </div>
        <label className={sLabel}><span>Tolerância de atraso (minutos)</span>
          <input inputMode="numeric" className={sInput} value={f.tolerance_minutes} onChange={(e) => set("tolerance_minutes", e.target.value)} /></label>
        <p className="text-xs text-foreground/60">Intervalo e antecedências valem imediatamente para os horários do cliente e para a confirmação. A tolerância é uma referência da equipe.</p>
      </section>

      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Cancelamento</h2>
        <label className={sLabel}><span>Prazo mínimo para o cliente cancelar (horas, vazio = sem prazo)</span>
          <input inputMode="numeric" className={sInput} value={f.cancel_min_hours} onChange={(e) => set("cancel_min_hours", e.target.value)} /></label>
        <p className="text-xs text-foreground/60">Dentro do prazo, o cliente vê o aviso para falar com a barbearia. Barbeiros e administração continuam podendo cancelar.</p>
      </section>

      <section className={`${sCard} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold uppercase tracking-wide text-brand">Reagendamento</h2>
          <Pending />
        </div>
        <p className="text-xs text-foreground/60">Regras da LA CREME guardadas aqui. Serão aplicadas quando a função de reagendamento pelo cliente existir; hoje ela não existe no app.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={sLabel}><span>Reagendamentos por semana</span>
            <input inputMode="numeric" className={sInput} value={f.reschedule_per_week} onChange={(e) => set("reschedule_per_week", e.target.value)} /></label>
          <label className={sLabel}><span>Cobrança adicional (R$)</span>
            <input inputMode="decimal" className={sInput} value={f.reschedule_fee} onChange={(e) => set("reschedule_fee", e.target.value)} /></label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">Não permitir reagendar no sábado</span>
          <Toggle checked={f.reschedule_block_saturday} onChange={(v) => set("reschedule_block_saturday", v)} label="Bloquear sábado" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={sLabel}><span>Não permitir após</span>
            <select className={sInput} value={f.reschedule_cutoff_weekday} onChange={(e) => set("reschedule_cutoff_weekday", e.target.value)}>
              <option value="">Sem limite</option>
              {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
            </select></label>
          <label className={sLabel}><span>às</span>
            <input type="time" className={sInput} value={f.reschedule_cutoff_time} onChange={(e) => set("reschedule_cutoff_time", e.target.value)} /></label>
        </div>
      </section>

      <section className={`${sCard} space-y-1`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Planos</h2>
        <p className="text-sm text-foreground/70">Limite de uso, frequência e compensação são definidos em cada plano, em Configurações → Planos.</p>
      </section>

      {msg && <p className="text-sm font-semibold text-foreground">{msg}</p>}
      <button type="button" onClick={save} className={`${sBtn} w-full`}>Salvar regras</button>
    </SettingsShell>
  );
}
