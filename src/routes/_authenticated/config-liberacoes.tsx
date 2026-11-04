import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppNav } from "@/components/app/AppNav";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/config-liberacoes")({
  head: () => ({
    meta: [
      { title: "Liberações da equipe — La Creme Barber" },
      { name: "description", content: "Escolha o que cada barbeiro e líder pode fazer no aplicativo." },
      { property: "og:title", content: "Liberações da equipe — La Creme Barber" },
      { property: "og:description", content: "Permissões de barbeiros e líderes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Perm = "create_clients" | "counter_sale" | "change_barber";
const PERMS: { key: Perm; label: string; desc: string }[] = [
  { key: "create_clients", label: "Cadastrar cliente novo", desc: "No agendamento, criar cliente que ainda não existe" },
  { key: "counter_sale", label: "Vender produto e bonificar", desc: "Botão \"Vender produto\" no Painel, com baixa no estoque" },
  { key: "change_barber", label: "Agendar para outro barbeiro", desc: "Trocar o barbeiro no resumo do agendamento" },
];
const LEADER = ["lider", "administrador", "dono"];

function Page() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["staff-permissions"],
    queryFn: async () => {
      const [b, p] = await Promise.all([
        supabase.from("barbers").select("id,name,last_name,team_role,user_id").is("archived_at", null).not("approved_at", "is", null).order("sort_order"),
        supabase.from("staff_permissions").select("*"),
      ]);
      if (b.error) throw b.error;
      const { data: u } = await supabase.auth.getUser();
      return { barbers: (b.data ?? []).filter((x) => x.user_id !== u.user?.id), perms: p.data ?? [] };
    },
  });

  const valueOf = (id: string, role: string, k: Perm) => {
    const row = q.data?.perms.find((p) => p.barber_id === id);
    if (row) return row[k];
    return k !== "create_clients" && LEADER.includes(role);
  };

  async function toggle(id: string, role: string, k: Perm, v: boolean) {
    const cur = Object.fromEntries(PERMS.map((p) => [p.key, valueOf(id, role, p.key)])) as Record<Perm, boolean>;
    cur[k] = v;
    const { error } = await supabase.rpc("set_staff_permissions", {
      _barber_id: id, _create_clients: cur.create_clients, _counter_sale: cur.counter_sale, _change_barber: cur.change_barber,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Liberação salva");
    qc.invalidateQueries({ queryKey: ["staff-permissions"] });
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Liberações da equipe</h1>
          <p className="text-sm text-foreground/65">Marque o que cada pessoa pode fazer. Vale na hora, inclusive no celular dela.</p>
        </div>
        {q.isLoading && <p className="text-foreground/70">Carregando...</p>}
        {q.data?.barbers.length === 0 && <p className="text-foreground/70">Nenhum barbeiro aprovado ainda.</p>}
        {q.data?.barbers.map((b) => {
          const full = b.last_name && !b.name.endsWith(b.last_name) ? `${b.name} ${b.last_name}` : b.name;
          return (
            <section key={b.id} className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
              <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <span className="font-semibold text-card-foreground">{full}</span>
                <span className="text-xs uppercase tracking-wider text-foreground/55">{LEADER.includes(b.team_role) ? "Líder" : "Barbeiro"}</span>
              </header>
              <div className="divide-y divide-border/70">
                {PERMS.map((p) => (
                  <label key={p.key} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                    <Checkbox checked={valueOf(b.id, b.team_role, p.key)} onCheckedChange={(v) => toggle(b.id, b.team_role, p.key, v === true)} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-card-foreground">{p.label}</span>
                      <span className="block text-sm text-foreground/65">{p.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
