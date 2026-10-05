import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import { brl, toCents, pct } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque | LA CREME BARBER" },
      { name: "description", content: "Produtos, entradas, ajustes e movimentações de estoque da LA CREME BARBER." },
      { property: "og:title", content: "Estoque | LA CREME BARBER" },
      { property: "og:description", content: "Controle de estoque e produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Product = {
  id: string; name: string; category: string; sku: string; price_cents: number; cost_cents: number;
  stock: number; min_stock: number; commission_pct: number; active: boolean; created_at: string;
};
type Movement = {
  id: string; product_id: string; kind: string; quantity: number; unit_cost_cents: number | null; note: string;
  balance_after: number; created_by: string | null; created_at: string; appointment_id: string | null;
};

const KIND_LABEL: Record<string, string> = {
  entrada: "Entrada", ajuste_positivo: "Ajuste positivo", ajuste_negativo: "Ajuste negativo", perda: "Perda",
  avaria: "Avaria", consumo_interno: "Consumo interno", venda: "Venda", estorno: "Estorno",
};
const ADJ_KINDS = ["ajuste_positivo", "ajuste_negativo", "perda", "avaria", "consumo_interno"] as const;
const TABS = [
  { k: "geral", l: "Visão geral" }, { k: "produtos", l: "Produtos" }, { k: "entrada", l: "Entrada" },
  { k: "movs", l: "Movimentações" }, { k: "ajustes", l: "Ajustes/perdas" }, { k: "baixo", l: "Estoque baixo" },
] as const;

const card = "rounded-lg border border-border bg-card p-4";
const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const label = "block space-y-1 text-sm font-semibold text-foreground";
const btn = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnGhost = "min-h-11 rounded-md border border-input px-3 text-sm font-semibold text-foreground";
const isLow = (p: Product) => p.stock <= p.min_stock;
const cents = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function LowBadge() {
  return <span className="rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-[11px] font-bold uppercase text-foreground">⚠ Estoque baixo</span>;
}

function StockPage() {
  const admin = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("geral");
  const ok = admin.data === true;
  const products = useQuery({
    queryKey: ["stock", "products"], enabled: ok,
    queryFn: async () => ((await supabase.from("products").select("*").order("name")).data ?? []) as Product[],
  });
  const movements = useQuery({
    queryKey: ["stock", "movements"], enabled: ok,
    queryFn: async () => ((await supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(500)).data ?? []) as Movement[],
  });
  const users = useQuery({
    queryKey: ["stock", "users"], enabled: ok,
    queryFn: async () => (await supabase.from("profiles").select("id, first_name, last_name")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["stock", "settings"], enabled: ok,
    queryFn: async () => (await supabase.from("operation_settings").select("commission_product_pct").eq("id", 1).maybeSingle()).data,
  });
  const list = products.data ?? [];
  const who = (id: string | null) => {
    const u = users.data?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}`.trim() : "—";
  };
  const pname = (id: string) => list.find((p) => p.id === id)?.name ?? "Produto";

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Estoque</h1>
        {admin.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {admin.data === false && <div className={`${card} text-center`}><p className="text-base text-foreground/80">Acesso restrito ao administrador.</p></div>}
        {ok && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TABS.map((t) => (
                <button key={t.k} type="button" onClick={() => setTab(t.k)}
                  className={`min-h-11 rounded-md border px-2 text-sm font-semibold ${tab === t.k ? "border-brand bg-secondary text-brand" : "border-input text-foreground/80"}`}>
                  {t.l}{t.k === "baixo" && list.filter((p) => p.active && isLow(p)).length ? ` (${list.filter((p) => p.active && isLow(p)).length})` : ""}
                </button>
              ))}
            </div>
            {tab === "geral" && <Overview products={list} movements={movements.data ?? []} />}
            {tab === "produtos" && <Products products={list} defaultPct={Number(settings.data?.commission_product_pct ?? 30)} />}
            {tab === "entrada" && <MoveForm products={list} kinds={["entrada"]} />}
            {tab === "ajustes" && <MoveForm products={list} kinds={[...ADJ_KINDS]} />}
            {tab === "movs" && <Movements movements={movements.data ?? []} pname={pname} who={who} />}
            {tab === "baixo" && <LowList products={list.filter((p) => p.active && isLow(p))} />}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ t, v }: { t: string; v: string }) {
  return <div className={card}><p className="text-xs font-semibold uppercase text-foreground/60">{t}</p><p className="mt-1 text-lg font-bold text-card-foreground">{v}</p></div>;
}

function Overview({ products, movements }: { products: Product[]; movements: Movement[] }) {
  const active = products.filter((p) => p.active);
  const sum = (k: string) => movements.filter((m) => m.kind === k).reduce((s, m) => s + Math.abs(m.quantity), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat t="Produtos ativos" v={String(active.length)} />
        <Stat t="Unidades em estoque" v={String(active.reduce((s, p) => s + p.stock, 0))} />
        <Stat t="Estoque baixo" v={String(active.filter(isLow).length)} />
        <Stat t="Valor em custo" v={brl(active.reduce((s, p) => s + p.stock * p.cost_cents, 0))} />
        <Stat t="Valor de venda" v={brl(active.reduce((s, p) => s + p.stock * p.price_cents, 0))} />
      </div>
      <p className="text-sm font-semibold text-foreground/80">Últimas 500 movimentações (unidades)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(KIND_LABEL).map(([k, l]) => <Stat key={k} t={l} v={String(sum(k))} />)}
      </div>
    </div>
  );
}

function Products({ products, defaultPct }: { products: Product[]; defaultPct: number }) {
  const qc = useQueryClient();
  const empty = { id: "", name: "", category: "", sku: "", price: "", cost: "", min: "0", commission: String(defaultPct).replace(".", ","), active: true, initial: false, initialQty: "" };
  const [f, setF] = useState<typeof empty | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f) return;
    setErr(null); setMsg(null);
    const commission = Number(f.commission.replace(",", "."));
    const min = parseInt(f.min || "0", 10);
    if (!f.name.trim()) return setErr("Informe o nome do produto.");
    if (toCents(f.price) < 0 || toCents(f.cost) < 0) return setErr("Valores inválidos.");
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) return setErr("Comissão deve ficar entre 0 e 100%.");
    if (!Number.isFinite(min) || min < 0) return setErr("Estoque mínimo inválido.");
    const initialQty = parseInt(f.initialQty || "0", 10);
    if (!f.id && f.initial && (!initialQty || initialQty <= 0)) return setErr("Informe a quantidade inicial.");
    const row = {
      name: f.name.trim(), category: f.category.trim(), sku: f.sku.trim(), price_cents: toCents(f.price), cost_cents: toCents(f.cost),
      min_stock: min, commission_pct: commission, active: f.active,
    };
    setBusy(true);
    const { data, error } = f.id
      ? await supabase.from("products").update(row).eq("id", f.id).select("id")
      : await supabase.from("products").insert(row).select("id");
    if (error || !data?.length) { setBusy(false); return setErr("Não foi possível salvar o produto."); }
    let extra = "";
    if (!f.id && f.initial) {
      const { error: mErr } = await supabase.rpc("register_stock_movement", {
        _product_id: data[0]!.id, _kind: "entrada", _quantity: initialQty, _unit_cost_cents: row.cost_cents, _note: "Estoque inicial",
      });
      extra = mErr
        ? " Mas a entrada inicial falhou: registre-a na aba Entrada."
        : ` Entrada inicial: +${initialQty} un. × ${brl(row.cost_cents)} = ${brl(initialQty * row.cost_cents)}.`;
    }
    setBusy(false);
    setF(null);
    setMsg(`Produto salvo com sucesso.${extra}`);
    qc.invalidateQueries({ queryKey: ["stock"] });
  }
  return (
    <div className="space-y-3">
      <button type="button" className={`${btn} w-full`} onClick={() => { setMsg(null); setErr(null); setF(f ? null : empty); }}>+ Novo produto</button>
      {msg && <p className="text-sm font-semibold text-brand">{msg}</p>}
      {f && (
        <section className={`${card} space-y-3`}>
          <label className={label}><span>Nome do produto</span><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}><span>Categoria</span><input className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
            <label className={label}><span>SKU/código (opcional)</span><input className={input} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></label>
            <label className={label}><span>Preço de venda (R$)</span><input inputMode="decimal" className={input} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label className={label}><span>Custo unitário (R$)</span><input inputMode="decimal" className={input} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></label>
            <label className={label}><span>Estoque mínimo</span><input inputMode="numeric" className={input} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/\D/g, "") })} /></label>
            <label className={label}><span>Comissão (%)</span><input inputMode="decimal" className={input} value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} /></label>
          </div>
          {!f.id && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
                <input type="checkbox" className="h-5 w-5" checked={f.initial} onChange={(e) => setF({ ...f, initial: e.target.checked })} /> Registrar estoque inicial
              </label>
              {f.initial ? (
                <>
                  <label className={label}><span>Quantidade inicial</span><input inputMode="numeric" className={input} value={f.initialQty} onChange={(e) => setF({ ...f, initialQty: e.target.value.replace(/\D/g, "") })} /></label>
                  <p className="text-sm text-foreground/70">Entrada automática: {parseInt(f.initialQty || "0", 10)} un. × {brl(toCents(f.cost))} = <b>{brl(parseInt(f.initialQty || "0", 10) * toCents(f.cost))}</b></p>
                </>
              ) : <p className="text-xs text-foreground/70">Sem estoque inicial, o produto começa em 0. Use a aba "Entrada" depois.</p>}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
            <input type="checkbox" className="h-5 w-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Produto ativo
          </label>
          {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn} disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar"}</button>
            <button type="button" className={btnGhost} onClick={() => setF(null)}>Voltar</button>
          </div>
        </section>
      )}
      {products.length === 0 && <p className="text-base text-foreground/70">Nenhum produto cadastrado.</p>}
      <div className="grid gap-3">
        {products.map((p) => (
          <div key={p.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-bold text-card-foreground">{p.name}</p>
                <p className="text-xs text-foreground/60">{[p.category, p.sku && `SKU ${p.sku}`, `Cadastro ${new Date(p.created_at).toLocaleDateString("pt-BR")}`].filter(Boolean).join(" · ")}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {!p.active && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold uppercase text-foreground/60">Inativo</span>}
                  {p.active && isLow(p) && <LowBadge />}
                </div>
              </div>
              <p className="shrink-0 text-right text-lg font-bold text-card-foreground">{p.stock}<span className="block text-xs font-normal text-foreground/60">mín. {p.min_stock}</span></p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-foreground/70 sm:grid-cols-3">
              <div>Venda: <b>{brl(p.price_cents)}</b></div>
              <div>Custo: <b>{brl(p.cost_cents)}</b></div>
              <div>Comissão: <b>{pct(p.commission_pct)}</b></div>
            </dl>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => { setMsg(null); setErr(null); setF({
              id: p.id, name: p.name, category: p.category, sku: p.sku, price: cents(p.price_cents), cost: cents(p.cost_cents),
              min: String(p.min_stock), commission: String(p.commission_pct).replace(".", ","), active: p.active, initial: false, initialQty: "",
            }); }}>Editar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveForm({ products, kinds }: { products: Product[]; kinds: string[] }) {
  const qc = useQueryClient();
  const isEntry = kinds[0] === "entrada";
  const [v, setV] = useState({ product: "", kind: kinds[0]!, qty: "", cost: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = products.find((x) => x.id === v.product);
  async function save() {
    setErr(null); setMsg(null);
    const qty = parseInt(v.qty || "0", 10);
    if (!p) return setErr("Escolha o produto.");
    if (!qty || qty <= 0) return setErr("Informe uma quantidade maior que zero.");
    setBusy(true);
    const { error } = await supabase.rpc("register_stock_movement", {
      _product_id: p.id, _kind: v.kind, _quantity: qty, _note: v.note.trim(),
      ...(isEntry && v.cost ? { _unit_cost_cents: toCents(v.cost) } : {}),
    });
    setBusy(false);
    if (error) return setErr(error.message || "Não foi possível registrar.");
    setMsg(`${KIND_LABEL[v.kind]} registrada: ${qty} un. de ${p.name}.`);
    setV({ ...v, qty: "", cost: "", note: "" });
    qc.invalidateQueries({ queryKey: ["stock"] });
  }
  return (
    <section className={`${card} space-y-3`}>
      <label className={label}><span>Produto</span>
        <select className={input} value={v.product} onChange={(e) => {
          const np = products.find((x) => x.id === e.target.value);
          setV({ ...v, product: e.target.value, cost: isEntry && np ? cents(np.cost_cents) : v.cost });
        }}>
          <option value="">Escolha</option>
          {products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.stock} em estoque){x.active ? "" : " · inativo"}</option>)}
        </select>
      </label>
      {!isEntry && (
        <label className={label}><span>Tipo</span>
          <select className={input} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={label}><span>Quantidade</span><input inputMode="numeric" className={input} value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value.replace(/\D/g, "") })} /></label>
        {isEntry && <label className={label}><span>Custo unitário (R$) · último preenchido</span><input inputMode="decimal" className={input} value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} /></label>}
      </div>
      <label className={label}><span>Observação (opcional)</span><input className={input} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      {p && <p className="text-sm text-foreground/70">Estoque atual: <b>{p.stock}</b></p>}
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      {msg && <p className="text-sm font-semibold text-brand">{msg}</p>}
      <button type="button" className={`${btn} w-full`} disabled={busy} onClick={save}>{busy ? "Salvando..." : isEntry ? "Registrar entrada" : "Registrar"}</button>
    </section>
  );
}

function Movements({ movements, pname, who }: { movements: Movement[]; pname: (id: string) => string; who: (id: string | null) => string }) {
  const [kind, setKind] = useState("");
  const list = movements.filter((m) => !kind || m.kind === kind);
  return (
    <div className="space-y-3">
      <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">Todos os tipos</option>
        {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {list.length === 0 && <p className="text-base text-foreground/70">Nenhuma movimentação.</p>}
      <div className="grid gap-2">
        {list.map((m) => (
          <div key={m.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold text-card-foreground">{pname(m.product_id)}</p>
                <p className="text-xs text-foreground/60">{dt(m.created_at)} · {KIND_LABEL[m.kind] ?? m.kind} · {who(m.created_by)}</p>
                {m.unit_cost_cents != null && m.kind === "entrada" && <p className="text-xs text-foreground/60">Custo unitário {brl(m.unit_cost_cents)}</p>}
                {m.note && <p className="break-words text-xs text-foreground/60">{m.note}</p>}
              </div>
              <p className={`shrink-0 text-right font-bold ${m.quantity > 0 ? "text-brand" : "text-destructive"}`}>
                {m.quantity > 0 ? "+" : "−"}{Math.abs(m.quantity)}
                <span className="block text-xs font-normal text-foreground/60">saldo {m.balance_after}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LowList({ products }: { products: Product[] }) {
  if (!products.length) return <p className="text-base text-foreground/70">Nenhum produto com estoque baixo.</p>;
  return (
    <div className="grid gap-2">
      {products.map((p) => (
        <div key={p.id} className={`${card} flex items-center justify-between gap-3`}>
          <div className="min-w-0"><p className="break-words font-semibold text-card-foreground">{p.name}</p><LowBadge /></div>
          <p className="shrink-0 text-right font-bold">{p.stock}<span className="block text-xs font-normal text-foreground/60">mín. {p.min_stock}</span></p>
        </div>
      ))}
    </div>
  );
}
