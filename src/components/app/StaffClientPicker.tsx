import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const input = "min-h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground";
const code5 = (n: number) => `#${String(n).padStart(5, "0")}`;
export type StaffClient = { id: string; code: number; first_name: string; last_name: string; whatsapp: string | null };
export type ClientEdits = { first: string; last: string; whats: string };

/** Busca/cadastro do cliente dentro do Resumo (equipe). Edições de nome/WhatsApp atualizam o cadastro ao confirmar. */
export function StaffClientPicker({ client, onPick, edits, onEdits, canCreate, onClose }: {
  client: StaffClient | null; onPick: (c: StaffClient | null) => void;
  edits: ClientEdits; onEdits: (e: ClientEdits) => void; canCreate: boolean; onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const search = useQuery({
    queryKey: ["client-search", term.trim()],
    enabled: !client && term.trim().length >= 2,
    queryFn: async () => ((await supabase.rpc("search_clients", { _q: term.trim() })).data ?? []) as StaffClient[],
  });
  useEffect(() => { if (client) setTerm(""); }, [client]);

  async function createNameOnly() {
    setErr(null);
    const [f, ...rest] = term.trim().split(/\s+/);
    setBusy(true);
    const { data: rows, error } = await supabase.rpc("create_walkin_client", { _first: f ?? "", _last: rest.join(" "), _whatsapp: "" });
    setBusy(false);
    const r = rows?.[0];
    if (error || !r) return setErr(error?.message || "Não foi possível registrar o cliente.");
    onPick({ id: r.id, code: r.code, first_name: f ?? "", last_name: rest.join(" "), whatsapp: null });
  }

  return (
    <div className="space-y-2 rounded-md border border-brand/40 bg-secondary/50 p-3">
      {client ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-foreground/70">Código: {code5(client.code)}</p>
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => onPick(null)}>Trocar cliente</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold"><span>Nome</span>
              <input className={input} maxLength={60} value={edits.first} onChange={(e) => onEdits({ ...edits, first: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-semibold"><span>Sobrenome</span>
              <input className={input} maxLength={60} value={edits.last} onChange={(e) => onEdits({ ...edits, last: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-semibold sm:col-span-2"><span>WhatsApp (opcional)</span>
              <input className={input} inputMode="tel" maxLength={30} placeholder="(16) 99999-0000" value={edits.whats} onChange={(e) => onEdits({ ...edits, whats: e.target.value })} /></label>
          </div>
          <p className="text-xs text-foreground/60">Alterações atualizam o cadastro do cliente.</p>
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-md border border-brand text-sm font-bold text-brand">Pronto</button>
        </>
      ) : (
        <>
          <input autoFocus className={input} placeholder="Digite nome, código ou WhatsApp" value={term} onChange={(e) => setTerm(e.target.value)} />
          {search.isFetching && <p className="text-sm text-foreground/60">Buscando...</p>}
          {search.data?.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="flex w-full flex-col items-start rounded-md border border-input bg-card p-3 text-left">
              <span className="font-semibold">{`${c.first_name} ${c.last_name}`.trim() || "Sem nome"}</span>
              <span className="text-xs text-foreground/70">Código: {code5(c.code)}{c.whatsapp ? ` · ${c.whatsapp}` : ""}</span>
            </button>
          ))}
          {term.trim().length >= 2 && search.data?.length === 0 && !search.isFetching && <p className="text-sm text-foreground/70">Nenhum cliente encontrado.</p>}
          {canCreate && term.trim().length >= 2 && !/^#?\d+$/.test(term.trim()) && !search.isFetching && (
            <button type="button" disabled={busy} onClick={createNameOnly} className="min-h-11 w-full rounded-md border border-brand px-3 text-sm font-bold text-brand disabled:opacity-50">
              Cadastrar “{term.trim()}”
            </button>
          )}
          {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
        </>
      )}
    </div>
  );
}
