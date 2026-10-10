import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { useSession } from "@/hooks/useSession";
import { getPanelAccess } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações | LA CREME BARBER" },
      { name: "description", content: "Seus avisos de agendamentos e da barbearia." },
      { property: "og:title", content: "Notificações | LA CREME BARBER" },
      { property: "og:description", content: "Central de notificações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsCenter,
});

const KIND: Record<string, string> = {
  agendamento: "Agendamento", cancelamento: "Cancelamento", reagendamento: "Reagendamento", alteracao: "Alteração",
  lembrete: "Lembrete", bloqueio: "Ausência/bloqueio", conflito: "Conflito", cadastro: "Cadastro", encaixe: "Encaixe", estoque: "Estoque",
};
const when = (s: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(s));

function NotificationsCenter() {
  const { session } = useSession();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const access = useQuery({ queryKey: ["panel-access", uid], enabled: !!uid, queryFn: getPanelAccess });
  const q = useQuery({
    queryKey: ["notifications", uid],
    enabled: !!uid,
    queryFn: async () =>
      (await supabase.from("notifications").select("id, kind, title, body, appointment_id, read_at, created_at, dedupe_key").eq("user_id", uid!).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["notif-unread"] }); };
  async function markRead(id: string) { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); refresh(); }
  async function markAll() { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid!).is("read_at", null); refresh(); }
  async function open(n: { id: string; appointment_id: string | null; read_at: string | null }) {
    if (!n.read_at) await markRead(n.id);
    if (!n.appointment_id) return;
    const r = access.data?.role;
    navigate({ to: r === "admin" || r === "barbeiro" ? "/painel" : "/meus-agendamentos" });
  }
  async function openAny(n: { id: string; kind: string; dedupe_key: string; appointment_id: string | null; read_at: string | null }) {
    if (n.appointment_id) return open(n);
    if (!n.read_at) await markRead(n.id);
    const r = access.data?.role;
    if (n.kind === "cadastro" && r === "admin" && n.dedupe_key.startsWith("profile:")) navigate({ to: "/admin-clientes", search: { cliente: n.dedupe_key.slice(8) } });
    else if (n.kind === "cadastro" && r === "admin") navigate({ to: "/admin-barbeiros" });
    else if (n.kind === "cadastro" && r === "barbeiro") navigate({ to: "/painel" });
    else if (n.kind === "estoque" && r === "admin") navigate({ to: "/estoque" });
    else if ((n.kind === "bloqueio" || n.kind === "conflito") && r === "admin") navigate({ to: "/ausencias" });
  }
  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground">Notificações</h1>
          {unread > 0 && <button type="button" onClick={markAll} className="min-h-11 rounded-md border border-input px-3 text-sm font-semibold">Marcar todas como lidas</button>}
        </div>
        {q.isLoading && <p className="text-foreground/70">Carregando...</p>}
        {q.data?.length === 0 && <div className="rounded-lg border border-border bg-card p-6 text-center text-foreground/80">Nenhuma notificação por enquanto.</div>}
        <div className="grid gap-2">
          {q.data?.map((n) => (
            <div key={n.id} className={`rounded-lg border bg-card p-4 ${n.read_at ? "border-border" : "border-brand"}`}>
              <button type="button" onClick={() => openAny(n)} className="block w-full min-w-0 text-left">
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gold">
                  {KIND[n.kind] ?? n.kind} · {when(n.created_at)}
                  {!n.read_at && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-brand-foreground">Nova</span>}
                </span>
                <span className="mt-1 block text-base font-bold text-card-foreground">{n.title}</span>
                <span className="block break-words text-sm text-foreground/80">{n.body}</span>
              </button>
              {!n.read_at && <button type="button" onClick={() => markRead(n.id)} className="mt-2 min-h-10 text-sm font-semibold text-brand">Marcar como lida</button>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
