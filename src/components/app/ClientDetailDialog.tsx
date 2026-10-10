import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, MessageCircle } from "lucide-react";
import { getClientDetail } from "@/lib/clients.functions";

const STATUS: Record<string, string> = { confirmed: "Confirmado", scheduled: "Agendado", completed: "Concluído", done: "Concluído", cancelled: "Cancelado", canceled: "Cancelado", no_show: "Não compareceu" };
const fmt = (s: string, time = true) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(s));
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ClientDetailDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const fetchDetail = useServerFn(getClientDetail);
  const q = useQuery({ queryKey: ["client-detail", clientId], queryFn: () => fetchDetail({ data: { clientId } }) });
  const c = q.data;
  const digits = c?.whatsapp?.replace(/\D/g, "") ?? "";
  const wa = digits ? `https://wa.me/${digits.length <= 11 ? "55" + digits : digits}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 shadow-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ficha do cliente">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-card-foreground">Ficha do cliente</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-md text-foreground/60 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>
        {q.isLoading && <p className="text-foreground/70">Carregando...</p>}
        {q.isError && <p className="text-destructive">Não foi possível carregar os dados.</p>}
        {q.isSuccess && !c && <p className="text-foreground/70">Este cadastro não existe mais.</p>}
        {c && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-bold text-card-foreground">{`${c.first_name} ${c.last_name}`.trim() || "Sem nome"}</p>
              {c.code != null && <p className="text-sm font-semibold text-gold">#{String(c.code).padStart(5, "0")}</p>}
              {c.archived && <p className="text-sm text-destructive">Cliente arquivado</p>}
            </div>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {[
                ["Nome", c.first_name || "—"],
                ["Sobrenome", c.last_name || "—"],
                ["WhatsApp", c.whatsapp || "—"],
                ["E-mail", c.email || "—"],
                ["Cadastrado em", fmt(c.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3 py-2.5 text-sm">
                  <dt className="text-foreground/60">{k}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold text-card-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 font-bold text-brand-foreground">
                <MessageCircle className="h-5 w-5" /> Abrir WhatsApp
              </a>
            )}
            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">Agendamentos ({c.appointments.length})</h3>
              {c.appointments.length === 0 && <p className="text-sm text-foreground/70">Nenhum agendamento ainda.</p>}
              <ul className="space-y-2">
                {c.appointments.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-semibold text-card-foreground">{a.services_label}</p>
                    <p className="text-foreground/70">{fmt(a.starts_at)}{a.barber ? ` · ${a.barber}` : ""}</p>
                    <p className="text-foreground/70">{STATUS[a.status] ?? a.status}{a.total_price_cents != null ? ` · ${brl(a.total_price_cents)}` : ""}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
