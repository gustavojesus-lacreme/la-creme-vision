import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";
import { SettingsShell, Toggle, sBtn, sBtnOutline, sCard, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/config-planos")({
  head: () => ({
    meta: [
      { title: "Planos | LA CREME BARBER" },
      { name: "description", content: "Crie e configure planos com serviços, validade e regras de uso." },
      { property: "og:title", content: "Planos | LA CREME BARBER" },
      { property: "og:description", content: "Planos da barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

type Item = { service_id: string; quantity: string };
type Form = {
  id: string | null; name: string; description: string; price: string; validity_days: string;
  max_uses_per_week: string; compensation_weeks: string; auto_renew: boolean; usage_rules: string; items: Item[];
};
const empty: Form = { id: null, name: "", description: "", price: "", validity_days: "", max_uses_per_week: "", compensation_weeks: "0", auto_renew: false, usage_rules: "", items: [] };
const toCents = (v: string) => Math.round(parseFloat(v.replace(",", ".")) * 100);
const posInt = (v: string) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };

function PlansPage() {
  const qc = useQueryClient();
  const plansQ = useQuery({
    queryKey: ["config-plans"],
    queryFn: async () => (await supabase.from("plans").select("*, plan_items(service_id, quantity)").order("created_at")).data ?? [],
  });
  const servicesQ = useQuery({
    queryKey: ["plan-services"],
    queryFn: async () => (await supabase.from("services").select("id, name").order("sort_order")).data ?? [],
  });
  const [f, setF] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const svcName = (id: string) => servicesQ.data?.find((s) => s.id === id)?.name ?? "Serviço";

  function edit(p: NonNullable<typeof plansQ.data>[number]) {
    setMsg(null);
    setF({
      id: p.id, name: p.name, description: p.description, price: (p.price_cents / 100).toFixed(2).replace(".", ","),
      validity_days: String(p.validity_days), max_uses_per_week: p.max_uses_per_week == null ? "" : String(p.max_uses_per_week),
      compensation_weeks: String(p.compensation_weeks), auto_renew: p.auto_renew, usage_rules: p.usage_rules,
      items: p.plan_items.map((i) => ({ service_id: i.service_id, quantity: String(i.quantity) })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!f) return;
    setMsg(null);
    const price = toCents(f.price);
    const validity = posInt(f.validity_days);
    if (!f.name.trim()) return setMsg("Informe o nome do plano.");
    if (!Number.isFinite(price) || price < 0) return setMsg("Informe um preço válido.");
    if (!validity) return setMsg("Informe a validade em dias.");
    if (f.items.length === 0) return setMsg("Adicione ao menos um serviço.");
    if (f.items.some((i) => !i.service_id || !posInt(i.quantity))) return setMsg("Confira serviços e quantidades.");
    if (new Set(f.items.map((i) => i.service_id)).size !== f.items.length) return setMsg("Cada serviço só pode aparecer uma vez.");
    setSaving(true);
    const row = {
      name: f.name.trim(), description: f.description.trim(), price_cents: price, validity_days: validity,
      max_uses_per_week: f.max_uses_per_week.trim() ? posInt(f.max_uses_per_week) : null,
      compensation_weeks: Math.max(0, Math.round(Number(f.compensation_weeks) || 0)),
      auto_renew: f.auto_renew, usage_rules: f.usage_rules.trim(),
    };
    let planId = f.id;
    if (planId) {
      const { error } = await supabase.from("plans").update(row).eq("id", planId);
      if (error) { setSaving(false); return setMsg("Não foi possível salvar."); }
      await supabase.from("plan_items").delete().eq("plan_id", planId);
    } else {
      const { data, error } = await supabase.from("plans").insert(row).select("id").single();
      if (error || !data) { setSaving(false); return setMsg("Não foi possível salvar."); }
      planId = data.id;
    }
    const { error: itemsErr } = await supabase.from("plan_items")
      .insert(f.items.map((i) => ({ plan_id: planId!, service_id: i.service_id, quantity: posInt(i.quantity)! })));
    setSaving(false);
    if (itemsErr) return setMsg("Plano salvo, mas houve erro nos serviços. Tente salvar novamente.");
    setF(null);
    setMsg("Plano salvo.");
    qc.invalidateQueries({ queryKey: ["config-plans"] });
  }

  async function setActive(id: string, active: boolean) {
    if (!active && !window.confirm("Desativar este plano? Ele deixa de ser oferecido.")) return;
    await supabase.from("plans").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["config-plans"] });
  }

  return (
    <SettingsShell title="Planos">
      {!f && (
        <button type="button" onClick={() => { setMsg(null); setF({ ...empty, items: [] }); }} className={`${sBtn} inline-flex w-full items-center justify-center gap-2`}>
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      )}
      {msg && !f && <p className="text-sm font-semibold text-brand">{msg}</p>}

      {f && (
        <section className={`${sCard} space-y-3`}>
          <h2 className="text-base font-bold text-card-foreground">{f.id ? "Editar plano" : "Novo plano"}</h2>
          <label className={sLabel}><span>Nome do plano</span><input className={sInput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className={sLabel}><span>Descrição</span><textarea className={`${sInput} min-h-20 py-2`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={sLabel}><span>Preço (R$)</span><input inputMode="decimal" className={sInput} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label className={sLabel}><span>Validade (dias)</span><input inputMode="numeric" className={sInput} value={f.validity_days} onChange={(e) => setF({ ...f, validity_days: e.target.value })} /></label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Serviços incluídos</p>
            {f.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                <select className={sInput} value={it.service_id} aria-label="Serviço"
                  onChange={(e) => setF({ ...f, items: f.items.map((x, i) => (i === idx ? { ...x, service_id: e.target.value } : x)) })}>
                  <option value="">Selecione</option>
                  {servicesQ.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input inputMode="numeric" className={sInput} aria-label="Quantidade" value={it.quantity}
                  onChange={(e) => setF({ ...f, items: f.items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)) })} />
                <button type="button" aria-label="Remover serviço" className="grid min-h-11 min-w-11 place-items-center text-destructive"
                  onClick={() => setF({ ...f, items: f.items.filter((_, i) => i !== idx) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" className={`${sBtnOutline} inline-flex w-full items-center justify-center gap-2`}
              onClick={() => setF({ ...f, items: [...f.items, { service_id: "", quantity: "1" }] })}>
              <Plus className="h-4 w-4" /> Adicionar serviço
            </button>
          </div>

          <h3 className="pt-2 text-sm font-bold uppercase tracking-wide text-brand">Regras de utilização</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={sLabel}><span>Usos por semana (vazio = livre)</span><input inputMode="numeric" className={sInput} value={f.max_uses_per_week} onChange={(e) => setF({ ...f, max_uses_per_week: e.target.value })} /></label>
            <label className={sLabel}><span>Semanas de compensação</span><input inputMode="numeric" className={sInput} value={f.compensation_weeks} onChange={(e) => setF({ ...f, compensation_weeks: e.target.value })} /></label>
          </div>
          <p className="text-xs text-foreground/60">Compensação: semanas extras concedidas se o cliente perder uma semana. Não renovam o plano.</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">Renovação automática</span>
            <Toggle checked={f.auto_renew} onChange={(v) => setF({ ...f, auto_renew: v })} label="Renovação automática" />
          </div>
          <label className={sLabel}><span>Outras regras (texto)</span><textarea className={`${sInput} min-h-20 py-2`} value={f.usage_rules} onChange={(e) => setF({ ...f, usage_rules: e.target.value })} /></label>

          {msg && <p className="rounded-md border border-gold bg-gold/10 p-3 text-sm font-semibold text-foreground">{msg}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setF(null)} className={`${sBtnOutline} flex-1`}>Cancelar</button>
            <button type="button" disabled={saving} onClick={save} className={`${sBtn} flex-1`}>{saving ? "Salvando..." : "Salvar plano"}</button>
          </div>
        </section>
      )}

      {plansQ.data?.length === 0 && !f && <p className="text-base text-foreground/70">Nenhum plano cadastrado.</p>}
      <div className="grid gap-3">
        {plansQ.data?.map((p) => (
          <div key={p.id} className={sCard}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-card-foreground">{p.name}</p>
                <p className="text-sm font-semibold text-foreground">{formatPrice(p.price_cents)} · {p.validity_days} dias</p>
                <p className="text-sm text-foreground/70">{p.plan_items.map((i) => `${i.quantity}× ${svcName(i.service_id)}`).join(" · ")}</p>
                <p className="text-xs text-foreground/60">
                  {p.max_uses_per_week ? `Até ${p.max_uses_per_week} uso(s) por semana` : "Uso livre"}
                  {p.compensation_weeks > 0 && ` · ${p.compensation_weeks} semana(s) de compensação`}
                  {p.auto_renew ? " · renovação automática" : ""}
                </p>
              </div>
              <Toggle checked={p.active} onChange={(v) => setActive(p.id, v)} label="Plano ativo" />
            </div>
            <button type="button" onClick={() => edit(p)} className="mt-3 min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground">Editar</button>
          </div>
        ))}
      </div>
    </SettingsShell>
  );
}
