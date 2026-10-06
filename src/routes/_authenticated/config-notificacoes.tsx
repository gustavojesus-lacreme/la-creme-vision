import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, Toggle, sCard } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/config-notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações | LA CREME BARBER" },
      { name: "description", content: "Escolha quais avisos ficam ativos para clientes, barbeiros e administração." },
      { property: "og:title", content: "Notificações | LA CREME BARBER" },
      { property: "og:description", content: "Configuração de avisos da barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const AUD = [["cliente", "Cliente"], ["barbeiro", "Barbeiro"], ["admin", "Administrador"]] as const;

function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => (await supabase.from("notification_settings").select("key, audience, label, enabled").order("sort_order")).data ?? [],
  });

  async function toggle(key: string, enabled: boolean) {
    qc.setQueryData(["notification-settings"], (old: typeof q.data) => old?.map((n) => (n.key === key ? { ...n, enabled } : n)));
    await supabase.from("notification_settings").update({ enabled }).eq("key", key);
    qc.invalidateQueries({ queryKey: ["notification-settings"] });
  }

  return (
    <SettingsShell title="Notificações">
      <div className="rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm text-foreground">
        Os avisos ligados aparecem na central de notificações (sino no topo) de cada pessoa. Envio por WhatsApp, e-mail ou SMS ainda não está conectado.
      </div>
      {AUD.map(([aud, title]) => (
        <section key={aud} className={`${sCard} space-y-1`}>
          <h2 className="pb-1 text-base font-bold uppercase tracking-wide text-brand">{title}</h2>
          {q.data?.filter((n) => n.audience === aud).map((n) => (
            <div key={n.key} className="flex min-h-12 items-center justify-between gap-3 border-t border-border first:border-t-0">
              <span className="text-base text-foreground">{n.label}</span>
              <Toggle checked={n.enabled} onChange={(v) => toggle(n.key, v)} label={n.label} />
            </div>
          ))}
        </section>
      ))}
    </SettingsShell>
  );
}
