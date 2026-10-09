import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX, Trash2 } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { sCard, sInput } from "@/components/app/SettingsShell";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (s: string) => {
  return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
};

export function BlockedDatesCard() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Date[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useQuery({
    queryKey: ["shop_blocked_dates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shop_blocked_dates").select("day, reason").order("day");
      if (error) throw error;
      return data ?? [];
    },
  });
  const today = ymd(new Date());
  const list = (q.data ?? []).filter((r) => r.day >= today);
  const blockedSet = new Set(list.map((r) => r.day));

  async function block() {
    if (!selected.length) return;
    setBusy(true); setMsg(null);
    const rows = selected.map((d) => ({ day: ymd(d), reason: reason.trim() }));
    const { error } = await supabase.from("shop_blocked_dates").upsert(rows);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Não foi possível bloquear as datas." });
    setSelected([]); setReason("");
    setMsg({ ok: true, text: rows.length === 1 ? "Data bloqueada." : `${rows.length} datas bloqueadas.` });
    qc.invalidateQueries({ queryKey: ["shop_blocked_dates"] });
  }

  async function unblock(day: string) {
    const { error } = await supabase.from("shop_blocked_dates").delete().eq("day", day);
    if (error) return setMsg({ ok: false, text: "Não foi possível desbloquear." });
    qc.invalidateQueries({ queryKey: ["shop_blocked_dates"] });
  }

  return (
    <section className={`${sCard} mt-6 space-y-4`}>
      <div className="flex items-center gap-2">
        <CalendarX className="h-5 w-5 text-brand" />
        <h2 className="font-display text-lg font-bold text-card-foreground">Bloquear datas (feriados e folgas)</h2>
      </div>
      <p className="text-sm text-foreground/60">Toque nos dias em que a barbearia não vai abrir. Pode escolher vários.</p>
      <div className="flex justify-center">
        <Calendar
          mode="multiple"
          locale={ptBR}
          selected={selected}
          onSelect={(d) => setSelected(d ?? [])}
          disabled={(d) => ymd(d) < today || blockedSet.has(ymd(d))}
          modifiers={{ blocked: (d) => blockedSet.has(ymd(d)) }}
          modifiersClassNames={{ blocked: "line-through text-destructive" }}
          className="pointer-events-auto rounded-md border border-border p-3"
        />
      </div>
      <input className={sInput} placeholder="Motivo (opcional), ex.: Natal" value={reason} maxLength={80}
        onChange={(e) => setReason(e.target.value)} />
      <button type="button" onClick={block} disabled={busy || !selected.length}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand px-4 font-bold text-brand-foreground disabled:bg-muted disabled:text-foreground/40">
        {busy ? "Bloqueando..." : selected.length ? `Bloquear ${selected.length} data(s)` : "Selecione as datas"}
      </button>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-brand" : "text-destructive"}`}>{msg.text}</p>}

      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase text-brand">Datas bloqueadas</h3>
        {list.length === 0 ? (
          <p className="text-sm text-foreground/60">Nenhuma data bloqueada.</p>
        ) : list.map((r) => (
          <div key={r.day} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize text-card-foreground">{fmt(r.day)}</p>
              {r.reason && <p className="truncate text-xs text-foreground/60">{r.reason}</p>}
            </div>
            <button type="button" aria-label="Desbloquear data" onClick={() => unblock(r.day)}
              className="grid h-11 w-11 place-items-center rounded-md text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
