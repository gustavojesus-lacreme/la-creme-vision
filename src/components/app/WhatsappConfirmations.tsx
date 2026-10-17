import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWhatsappConfirmations } from "@/lib/whatsapp.functions";

const labels: Record<string, string> = { pending: "Pendente", sending: "Em processamento", accepted: "Aceito pelo WhatsApp", sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou", unresolved: "Verificar antes de tentar novamente" };
const errors: Record<string, string> = { invalid_phone: "WhatsApp inválido", provider_failed: "Falha informada pelo WhatsApp" };
const when = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function WhatsappConfirmations() {
  const fetchConfirmations = useServerFn(listWhatsappConfirmations);
  const query = useQuery({ queryKey: ["whatsapp-confirmations"], queryFn: () => fetchConfirmations() });
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand">Confirmações por WhatsApp</h2>
        <Button variant="outline" size="icon" aria-label="Atualizar confirmações" title="Atualizar confirmações" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw /></Button>
      </div>
      <p className="text-sm text-foreground/70">Não conectado · envios desativados</p>
      {query.isPending && <p className="text-sm">Carregando...</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar as confirmações.</p>}
      {query.data?.messages.length === 0 && <p className="text-sm text-foreground/70">Nenhuma confirmação registrada nesta etapa.</p>}
      <div className="divide-y divide-border">
        {query.data?.messages.map((message) => (
          <article key={message.id} className="space-y-1 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{[message.appointments?.customer_first_name, message.appointments?.customer_last_name].filter(Boolean).join(" ") || "Cliente"}</h3>
              <span className={`text-sm font-semibold ${message.state === "failed" ? "text-destructive" : "text-brand"}`}>{labels[message.state] ?? "Pendente"}</span>
            </div>
            {message.appointments && <p className="text-sm text-foreground/70">{when(message.appointments.starts_at)} · {message.appointments.services_label}</p>}
            <p className="break-all text-xs text-foreground/60">Agendamento: {message.appointment_id}</p>
            <p className="text-sm text-foreground/70">{message.last_attempt_at ? `Última tentativa: ${when(message.last_attempt_at)} · ${message.attempts} tentativa(s)` : "Sem tentativa de envio"}</p>
            {message.blocked_reason && <p className="text-sm text-foreground/70">Aguardando conexão e aprovação do modelo.</p>}
            {message.error_code && <p className="text-sm text-destructive">{errors[message.error_code] ?? `Erro do WhatsApp: ${message.error_code}`}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}