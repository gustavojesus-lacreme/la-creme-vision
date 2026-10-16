import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, sBtn, sBtnOutline, sCard, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/admin-planos-clientes")({
  head: () => ({
    meta: [
      { title: "Clientes com plano | LA CREME BARBER" },
      { name: "description", content: "Registre clientes com plano pago e acompanhe os cortes restantes." },
      { property: "og:title", content: "Clientes com plano | LA CREME BARBER" },
      { property: "og:description", content: "Controle de planos mensais dos clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPlansPage,
});

type Found = { id: string; code: number; first_name: string; last_name: string; whatsapp: string | null };
const code5 = (n: number) => `#${String(n).padStart(5, "0")}`;
const in30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

function ClientPlansPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [sel, setSel] = useState<Found | null>(null);
  const [planId, setPlanId] = useState("");
  const [uses, setUses] = useState("2");
  const [expires, setExpires] = useState(in30());
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"completo" | "parcial">("completo");
  const [fullDraft, setFullDraft] = useState<string | null>(null);
  const rulesQ = useQuery({ queryKey: ["plan-rules"], queryFn: async () => (await supabase.from("operation_settings").select("plan_full_uses").eq("id", 1).maybeSingle()).data });
  const fullUses = rulesQ.data?.plan_full_uses ?? 4;
  async function saveRule() {
    const n = Math.round(Number(fullDraft));
    if (!(n >= 1 && n <= 60)) return setMsg("Créditos do plano completo: de 1 a 60.");
    const { error } = await supabase.from("operation_settings").update({ plan_full_uses: n }).eq("id", 1);
    if (error) return setMsg("Não foi possível salvar a regra.");
    setFullDraft(null); setMsg("Regra do plano salva.");
    qc.invalidateQueries({ queryKey: ["plan-rules"] });
  }

  const plansQ = useQuery({ queryKey: ["plans-active"], queryFn: async () => (await supabase.from("plans").select("id, name").eq("active", true).order("name")).data ?? [] });
  const listQ = useQuery({
    queryKey: ["client-plans"],
    queryFn: async () => (await supabase.from("client_plans")
      .select("id, label, total_uses, used_uses, expires_on, active, paid_at, clients(code, first_name, last_name, whatsapp, profiles(first_name, last_name, whatsapp))")
      .eq("active", true).order("paid_at", { ascending: false })).data ?? [],
  });

  async function search() {
    setMsg(null);
    const { data, error } = await supabase.rpc("search_clients", { _q: q });
    if (error) return setMsg("Não foi possível buscar.");
    setFound((data ?? []) as Found[]);
    if (!data?.length) setMsg("Nenhum cliente encontrado.");
  }

  async function add() {
    if (!sel) return;
    const total = kind === "completo" ? fullUses : Math.round(Number(uses));
    if (!(total > 0)) return setMsg("Informe a quantidade de cortes.");
    const base = plansQ.data?.find((p) => p.id === planId)?.name ?? "Plano mensal";
    const label = `${base} (${kind === "completo" ? "completo" : "parcial"})`;
    const { error } = await supabase.from("client_plans").insert({ client_id: sel.id, plan_id: planId || null, label, total_uses: total, expires_on: expires || null });
    if (error) return setMsg("Não foi possível salvar o plano.");
    setMsg(`Plano registrado para ${sel.first_name}.`);
    setSel(null); setFound([]); setQ("");
    qc.invalidateQueries({ queryKey: ["client-plans"] });
  }

  async function adjust(id: string, used: number) {
    await supabase.from("client_plans").update({ used_uses: Math.max(0, used) }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["client-plans"] });
  }
  async function end(id: string) {
    if (!window.confirm("Encerrar este plano?")) return;
    await supabase.from("client_plans").update({ active: false }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["client-plans"] });
  }

  const rows = (listQ.data ?? []).map((r: any) => {
    const c = r.clients ?? {};
    const p = c.profiles;
    const name = `${p?.first_name ?? c.first_name ?? ""} ${p?.last_name ?? c.last_name ?? ""}`.trim();
    return { ...r, name, code: c.code as number, whatsapp: (p?.whatsapp || c.whatsapp || "") as string };
  });
  const f = filter.trim().toLowerCase();
  const fd = f.replace(/\D/g, "");
  const shown = rows.filter((r) => !f || r.name.toLowerCase().includes(f) || (fd && (String(r.code).includes(fd) || r.whatsapp.replace(/\D/g, "").includes(fd))));

  return (
    <SettingsShell title="Clientes com plano">
      <section className={`${sCard} space-y-2`}>
        <h2 className="text-base font-bold text-card-foreground">Regra do plano/assinatura</h2>
        <p className="text-sm text-foreground/70">Plano completo dá {fullUses} créditos (1 corte por crédito). Plano parcial: você define a quantidade ao registrar.</p>
        <div className="flex gap-2">
          <input inputMode="numeric" aria-label="Créditos do plano completo" className={sInput} value={fullDraft ?? String(fullUses)} onChange={(e) => setFullDraft(e.target.value)} />
          <button type="button" onClick={saveRule} disabled={fullDraft == null} className={sBtn}>Salvar</button>
        </div>
      </section>
      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold text-card-foreground">Registrar plano pago</h2>
        <div className="flex gap-2">
          <input className={sInput} placeholder="Nome, sobrenome, WhatsApp ou código" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button type="button" onClick={search} className={`${sBtn} px-4`} aria-label="Buscar"><Search className="h-4 w-4" /></button>
        </div>
        {!sel && found.map((c) => (
          <button key={c.id} type="button" onClick={() => setSel(c)} className="block w-full rounded-md border border-input p-3 text-left">
            <span className="font-semibold text-foreground">{c.first_name} {c.last_name}</span>
            <span className="block text-sm text-foreground/70">{code5(c.code)}{c.whatsapp ? ` · ${c.whatsapp}` : ""}</span>
          </button>
        ))}
        {sel && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Cliente: {sel.first_name} {sel.last_name} ({code5(sel.code)})</p>
            <label className={sLabel}><span>Plano</span>
              <select className={sInput} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Plano mensal (corte)</option>
                {plansQ.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["completo", "parcial"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  className={kind === k ? sBtn : sBtnOutline}>{k === "completo" ? `Completo (${fullUses})` : "Parcial"}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {kind === "parcial"
                ? <label className={sLabel}><span>Créditos (parcial)</span><input inputMode="numeric" className={sInput} value={uses} onChange={(e) => setUses(e.target.value)} /></label>
                : <p className="self-end pb-3 text-sm font-semibold text-foreground">{fullUses} créditos</p>}
              <label className={sLabel}><span>Válido até</span><input type="date" className={sInput} value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSel(null)} className={`${sBtnOutline} flex-1`}>Cancelar</button>
              <button type="button" onClick={add} className={`${sBtn} flex-1`}>Salvar (já pago)</button>
            </div>
          </div>
        )}
        {msg && <p className="text-sm font-semibold text-brand">{msg}</p>}
        <p className="text-xs text-foreground/60">Ao agendar, os serviços do plano saem sem cobrança e um corte é descontado. Se o agendamento for cancelado, o corte volta.</p>
      </section>

      <input className={sInput} placeholder="Filtrar planos ativos por nome, WhatsApp ou código" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.length === 0 && <p className="text-base text-foreground/70">Nenhum plano ativo.</p>}
      <div className="grid gap-3">
        {shown.map((r) => {
          const left = r.total_uses - r.used_uses;
          return (
            <div key={r.id} className={sCard}>
              <p className="text-base font-bold text-card-foreground">{r.name || "Sem nome"} <span className="text-sm text-foreground/70">{r.code != null ? code5(r.code) : ""}</span></p>
              <p className="text-sm text-foreground/70">{r.label}{r.expires_on ? ` · até ${r.expires_on.split("-").reverse().join("/")}` : ""}</p>
              <p className="mt-1 text-sm font-bold text-brand">Restam {left} de {r.total_uses} cortes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={sBtnOutline} onClick={() => adjust(r.id, r.used_uses + 1)} disabled={left <= 0}>Marcar corte usado</button>
                <button type="button" className={sBtnOutline} onClick={() => adjust(r.id, r.used_uses - 1)} disabled={r.used_uses <= 0}>Devolver corte</button>
                <button type="button" className={`${sBtnOutline} text-destructive`} onClick={() => end(r.id)}>Encerrar</button>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsShell>
  );
}
