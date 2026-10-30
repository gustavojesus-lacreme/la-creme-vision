import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brl, groupAttendances, rangeToIso, toCents, type Entry, type Attendance, type PaymentMethod } from "@/lib/finance";

const input = "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground";
type CorrectionEntry = Entry & { updated_at: string; cash_received_cents: number | null; change_method: string | null };

export function PaymentCorrections({ range, methods, isAdmin }: { range: { from: string; to: string }; methods: PaymentMethod[]; isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [success, setSuccess] = useState("");
  const qc = useQueryClient();
  const iso = rangeToIso(range);
  const query = useQuery({ queryKey: ["payment-corrections", range.from, range.to], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_correctable_payment_entries", { _from: iso.from, _to: iso.to });
    if (error) throw error;
    return data as CorrectionEntry[];
  } });
  const list = groupAttendances(query.data ?? []).filter(a => a.client.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="space-y-4">
    {isAdmin && <LeaderPermissions />}
    <label className="block space-y-1 text-sm font-semibold"><span>Buscar atendimento finalizado</span><input className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do cliente" /></label>
    {success && <p role="status" className="text-sm font-semibold text-brand">{success}</p>}
    {query.isPending && <p>Carregando atendimentos...</p>}
    {query.error && <p role="alert" className="text-destructive">Não foi possível carregar os pagamentos.</p>}
    {query.isSuccess && !list.length && <p className="text-sm text-muted-foreground">Nenhum atendimento finalizado neste período.</p>}
    {list.map(a => <article key={a.key} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{a.client || "Cliente"}</h2><p className="text-sm text-muted-foreground">{new Date(a.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</p></div><strong className="shrink-0 text-brand">{brl(a.paid)}</strong></div>
      <p className="text-sm">{a.services.map(s => s.name).join(" + ")}</p>
      <p className="text-sm text-muted-foreground">{[...new Set(a.entries.map(e => methods.find(m => m.id === e.payment_method)?.label ?? "Sem pagamento"))].join(" / ")}</p>
      <Button variant="outline" className="min-h-11 w-full" onClick={() => { setSuccess(""); setSelected(a); }}><Pencil /> Corrigir pagamento</Button>
    </article>)}
    {selected && <PaymentCorrectionDialog attendance={selected} methods={methods} onClose={() => setSelected(null)} onDone={async () => {
      setSelected(null); setSuccess("Pagamento corrigido. Taxas e valores financeiros atualizados.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["payment-corrections"] }), qc.invalidateQueries({ queryKey: ["fin-entries"] }), qc.invalidateQueries({ queryKey: ["payment-correction-history"] })]);
    }} />}
  </div>;
}

function PaymentCorrectionDialog({ attendance, methods, onClose, onDone }: { attendance: Attendance; methods: PaymentMethod[]; onClose: () => void; onDone: () => void }) {
  const rows = attendance.entries as CorrectionEntry[];
  const service = rows.find(e => e.category === "servico");
  const [method, setMethod] = useState(attendance.method ?? "");
  const [reason, setReason] = useState("");
  const [hasChange, setHasChange] = useState(!!service?.cash_received_cents);
  const [cash, setCash] = useState(service?.cash_received_cents ? (service.cash_received_cents / 100).toFixed(2).replace(".", ",") : "");
  const [changeMethod, setChangeMethod] = useState(service?.change_method ?? "pix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const history = useQuery({ queryKey: ["payment-correction-history", attendance.key], queryFn: async () => {
    const { data, error } = await supabase.from("financial_payment_corrections").select("id,changed_at,reason").eq("appointment_id", attendance.key).order("changed_at", { ascending: false });
    if (error) throw error;
    return data;
  } });
  async function save() {
    const id = attendance.appointmentId;
    if (!id) return;
    setError("");
    if (reason.trim().length < 3) return setError("Informe o motivo da correção.");
    if (method === "dinheiro" && hasChange && toCents(cash) <= attendance.paid) return setError("O dinheiro recebido precisa ser maior que o total pago para ter troco.");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("correct_appointment_payment", {
        _appointment_id: id, _method: method, _reason: reason.trim(),
        _expected: [...rows].sort((a, b) => a.id.localeCompare(b.id)).map(e => ({ id: e.id, updated_at: e.updated_at })),
        _cash_received_cents: method === "dinheiro" && hasChange ? toCents(cash) : null,
        _change_method: method === "dinheiro" && hasChange ? changeMethod : null,
      });
      if (error) throw error;
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Não foi possível corrigir o pagamento."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg">
    <DialogTitle>Corrigir pagamento</DialogTitle>
    <DialogDescription>{attendance.client} · Total pago {brl(attendance.paid)}</DialogDescription>
    <label className="space-y-1 text-sm font-semibold"><span>Forma de pagamento correta</span><select className={input} value={method} onChange={e => setMethod(e.target.value)}><option value="">Selecione</option>{methods.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
    {method === "dinheiro" && <><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><Checkbox checked={hasChange} onCheckedChange={v => setHasChange(v === true)} />Teve troco?</label>{hasChange && <><label className="space-y-1 text-sm font-semibold"><span>Dinheiro recebido (R$)</span><input className={input} inputMode="decimal" value={cash} onChange={e => setCash(e.target.value)} /></label><p className="font-semibold">Troco: {brl(Math.max(0, toCents(cash) - attendance.paid))}</p><label className="space-y-1 text-sm font-semibold"><span>Troco devolvido por</span><select className={input} value={changeMethod} onChange={e => setChangeMethod(e.target.value)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option></select></label></>}</>}
    <label className="space-y-1 text-sm font-semibold"><span>Motivo da correção</span><input className={input} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Ex.: registrado Pix, recebido em dinheiro" /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="min-h-12" disabled={busy} onClick={onClose}>Voltar</Button><Button className="min-h-12" disabled={busy || !method} onClick={save}><Save />{busy ? "Salvando..." : "Salvar correção"}</Button></div>
    {!!history.data?.length && <div className="space-y-2 border-t border-border pt-3"><h3 className="text-sm font-bold">Histórico de correções</h3>{history.data.map(h => <p key={h.id} className="break-words text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {h.reason}</p>)}</div>}
  </DialogContent></Dialog>;
}

function LeaderPermissions() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["financial-leader-permissions"], queryFn: async () => {
    const [leaders, permissions] = await Promise.all([
      supabase.from("barbers").select("id,name,last_name").eq("team_role", "lider").eq("active", true).not("approved_at", "is", null).not("user_id", "is", null).is("archived_at", null).order("name"),
      supabase.from("financial_correction_permissions").select("barber_id"),
    ]);
    if (leaders.error) throw leaders.error;
    if (permissions.error) throw permissions.error;
    return { leaders: leaders.data, allowed: new Set(permissions.data.map(p => p.barber_id)) };
  } });
  async function toggle(id: string, enabled: boolean) {
    setBusy(true); setError("");
    try {
      const { error } = await supabase.rpc("set_financial_correction_permission", { _barber_id: id, _enabled: enabled });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["financial-leader-permissions"] });
    } catch { setError("Não foi possível alterar a autorização."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2 border-b border-border pb-4"><h2 className="font-bold">Líderes autorizados a corrigir pagamentos</h2>
    {q.isSuccess && !q.data.leaders.length && <p className="text-sm text-muted-foreground">Nenhum líder ativo com conta vinculada.</p>}
    {q.data?.leaders.map(l => <label key={l.id} className="flex min-h-11 items-center gap-3 text-sm"><Checkbox disabled={busy} checked={q.data.allowed.has(l.id)} onCheckedChange={v => toggle(l.id, v === true)} />{l.name}{l.last_name && !l.name.endsWith(l.last_name) ? ` ${l.last_name}` : ""}</label>)}
    {(error || q.error) && <p role="alert" className="text-sm text-destructive">{error || "Não foi possível carregar as autorizações."}</p>}
  </section>;
}