import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";

const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground";
type Item = { type: "produto" | "servico"; id: string; name: string; price: number; qty: number; stock?: number | undefined };

/** Venda de balcão ou bonificação (produto/serviço) sem agendamento. Só administrador e líder. */
export function CounterSaleDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [bonus, setBonus] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [method, setMethod] = useState("");
  const [clientName, setClientName] = useState("");
  const [barber, setBarber] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = useQuery({
    queryKey: ["counter-sale-base"],
    queryFn: async () => {
      const [p, s, m, b] = await Promise.all([
        supabase.from("products").select("id, name, price_cents, stock").eq("active", true).order("name"),
        supabase.from("services").select("id, name, price_cents").eq("active", true).order("sort_order"),
        supabase.from("payment_methods").select("id, label").eq("active", true).order("sort_order"),
        supabase.from("barbers").select("id, name").eq("active", true).not("approved_at", "is", null).is("archived_at", null).order("sort_order"),
      ]);
      return { products: p.data ?? [], services: s.data ?? [], methods: m.data ?? [], barbers: b.data ?? [] };
    },
  });

  function add(type: Item["type"], id: string) {
    if (!id) return;
    setItems((cur) => {
      const hit = cur.find((i) => i.type === type && i.id === id);
      if (hit) return cur.map((i) => (i === hit ? { ...i, qty: i.qty + 1 } : i));
      const src = type === "produto" ? base.data?.products.find((x) => x.id === id) : base.data?.services.find((x) => x.id === id);
      if (!src) return cur;
      return [...cur, { type, id, name: src.name, price: src.price_cents, qty: 1, stock: "stock" in src ? (src.stock as number) : undefined }];
    });
  }
  const setQty = (i: Item, q: number) => setItems((cur) => (q <= 0 ? cur.filter((x) => x !== i) : cur.map((x) => (x === i ? { ...x, qty: q } : x))));
  const total = bonus ? 0 : items.reduce((t, i) => t + i.price * i.qty, 0);

  async function save() {
    setErr(null);
    if (!items.length) return setErr("Escolha ao menos um produto ou serviço.");
    if (!bonus && !method) return setErr("Escolha a forma de pagamento.");
    if (items.some((i) => i.stock != null && i.qty > i.stock)) return setErr("Estoque insuficiente para algum produto.");
    setBusy(true);
    const { error } = await supabase.rpc("register_counter_sale", {
      _items: items.map((i) => ({ type: i.type, id: i.id, qty: i.qty })),
      _method: bonus ? "" : method, _client_name: clientName, _seller_barber_id: barber || null, _bonus: bonus, _note: note,
    } as never);
    setBusy(false);
    if (error) return setErr(error.message || "Não foi possível registrar.");
    onDone(bonus ? "Bonificação registrada e estoque baixado." : "Venda registrada e estoque baixado.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Vender produto">
      <div className="max-h-[90svh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-card p-4">
        <h2 className="text-lg font-bold text-card-foreground">{bonus ? "Bonificação" : "Vender produto"}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setBonus(false)} className={`min-h-11 rounded-md border text-sm font-semibold ${!bonus ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>Venda</button>
          <button type="button" onClick={() => setBonus(true)} className={`min-h-11 rounded-md border text-sm font-semibold ${bonus ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>Bonificação</button>
        </div>
        {bonus && <p className="text-xs text-foreground/70">Sai de graça (R$ 0), baixa o estoque e não gera comissão.</p>}

        <label className="block space-y-1 text-sm font-semibold"><span>Produto</span>
          <select aria-label="Produto" className={input} value="" onChange={(e) => add("produto", e.target.value)}>
            <option value="">Adicionar produto</option>
            {base.data?.products.map((p) => <option key={p.id} value={p.id} disabled={p.stock <= 0}>{p.name} · {formatPrice(p.price_cents)} · estoque {p.stock}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold"><span>Serviço (opcional)</span>
          <select aria-label="Serviço" className={input} value="" onChange={(e) => add("servico", e.target.value)}>
            <option value="">Adicionar serviço</option>
            {base.data?.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatPrice(s.price_cents)}</option>)}
          </select>
        </label>

        {items.length > 0 && (
          <div className="space-y-2 rounded-md border border-border p-2">
            {items.map((i) => (
              <div key={i.type + i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Diminuir" className="h-9 w-9 rounded-md border border-input" onClick={() => setQty(i, i.qty - 1)}>−</button>
                  <span className="w-6 text-center font-semibold">{i.qty}</span>
                  <button type="button" aria-label="Aumentar" className="h-9 w-9 rounded-md border border-input" onClick={() => setQty(i, i.qty + 1)}>+</button>
                </div>
                <span className="w-20 text-right font-semibold">{formatPrice(bonus ? 0 : i.price * i.qty)}</span>
              </div>
            ))}
          </div>
        )}

        {!bonus && (
          <div className="space-y-1 text-sm font-semibold"><span>Pagamento</span>
            <div className="grid grid-cols-2 gap-2">
              {base.data?.methods.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)} className={`min-h-11 rounded-md border text-sm ${method === m.id ? "border-brand bg-secondary text-brand" : "border-input"}`}>{m.label}</button>
              ))}
            </div>
          </div>
        )}
        <input className={input} placeholder="Nome do cliente (opcional)" maxLength={120} value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <select aria-label="Barbeiro" className={input} value={barber} onChange={(e) => setBarber(e.target.value)}>
          <option value="">Barbeiro (opcional)</option>
          {base.data?.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className={input} placeholder="Observação (opcional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />

        <p className="text-right text-lg font-bold text-brand">Total: {formatPrice(total)}</p>
        {err && <p role="alert" className="text-sm font-semibold text-destructive">{err}</p>}
        <div className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-border bg-card p-4">
          <button type="button" onClick={onClose} className="min-h-12 rounded-md border border-input text-sm font-semibold">Voltar</button>
          <button type="button" disabled={busy} onClick={save} className="min-h-12 rounded-md bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50">
            {busy ? "Salvando..." : bonus ? "Registrar bonificação" : "Registrar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}
