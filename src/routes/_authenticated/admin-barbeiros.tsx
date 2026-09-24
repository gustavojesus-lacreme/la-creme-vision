import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin-barbeiros")({
  head: () => ({
    meta: [
      { title: "Barbeiros | LA CREME BARBER" },
      { name: "description", content: "Gerencie os barbeiros e seus acessos." },
      { property: "og:title", content: "Barbeiros | LA CREME BARBER" },
      { property: "og:description", content: "Área administrativa de barbeiros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminBarbersPage,
});

type Barber = { id: string; name: string; active: boolean; user_id: string | null; service_ids: string[]; sort_order: number };

const card = "rounded-lg border border-border bg-card p-4";
const input =
  "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const btnPrimary = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnOutline = "min-h-12 rounded-md border border-input px-3 text-sm font-semibold text-foreground";

function AdminBarbersPage() {
  const qc = useQueryClient();
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;

  const barbersQuery = useQuery({
    queryKey: ["admin-barbers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("barbers").select("id, name, active, user_id, service_ids, sort_order").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Barber[];
    },
  });
  const servicesQuery = useQuery({
    queryKey: ["admin-barber-services"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name").eq("active", true).order("sort_order");
      return data ?? [];
    },
  });

  const [editing, setEditing] = useState<Barber | "new" | null>(null);
  const [name, setName] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [previewId, setPreviewId] = useState("");

  function open(b: Barber | "new") {
    setEditing(b);
    setErr(null);
    setName(b === "new" ? "" : b.name);
    setServiceIds(b === "new" ? [] : b.service_ids);
    setActive(b === "new" ? true : b.active);
  }

  async function save() {
    if (!name.trim()) return setErr("Informe o nome.");
    const payload = { name: name.trim(), service_ids: serviceIds, active };
    const { error } =
      editing === "new"
        ? await supabase.from("barbers").insert({ ...payload, sort_order: (barbersQuery.data?.length ?? 0) + 1 })
        : await supabase.from("barbers").update(payload).eq("id", (editing as Barber).id);
    if (error) return setErr("Não foi possível salvar.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-barbers"] });
  }

  async function toggle(b: Barber) {
    await supabase.from("barbers").update({ active: !b.active }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["admin-barbers"] });
  }

  async function invite(b: Barber) {
    const { data, error } = await supabase.from("barber_invites").insert({ barber_id: b.id }).select("token").single();
    if (error || !data) return;
    const url = `${window.location.origin}/convite/${data.token}`;
    setLinks((l) => ({ ...l, [b.id]: url }));
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  const serviceName = (id: string) => servicesQuery.data?.find((s) => s.id === id)?.name;

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Barbeiros</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && (
          <div className={`${card} text-center`}><p className="text-base text-foreground/80">Acesso restrito ao administrador.</p></div>
        )}
        {isAdmin && (
          <>
            <div className={card}>
              <p className="mb-2 text-base font-bold text-card-foreground">Visualizar como barbeiro</p>
              <div className="flex gap-2">
                <select className={input} value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
                  <option value="">Escolha um barbeiro</option>
                  {barbersQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {previewId ? (
                  <Link to="/painel" search={{ ver: previewId }} className={`${btnPrimary} flex items-center`}>Ver</Link>
                ) : (
                  <button disabled className={btnPrimary}>Ver</button>
                )}
              </div>
            </div>

            {editing ? (
              <div className={`${card} space-y-3`}>
                <p className="text-base font-bold text-card-foreground">{editing === "new" ? "Novo barbeiro" : "Editar barbeiro"}</p>
                <input className={input} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <p className="text-sm font-semibold text-foreground/80">Serviços que realiza</p>
                <div className="grid grid-cols-2 gap-2">
                  {servicesQuery.data?.map((s) => {
                    const on = serviceIds.includes(s.id);
                    return (
                      <button key={s.id} type="button"
                        onClick={() => setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])}
                        className={`min-h-11 rounded-md border px-2 text-sm font-semibold ${on ? "border-brand bg-secondary text-brand" : "border-input text-foreground"}`}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> Ativo
                </label>
                <p className="text-sm text-foreground/70">Função: barbeiro</p>
                {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
                <div className="flex gap-2">
                  <button className={btnPrimary} onClick={save}>Salvar</button>
                  <button className={btnOutline} onClick={() => setEditing(null)}>Voltar</button>
                </div>
              </div>
            ) : (
              <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => open("new")}>
                <Plus className="h-5 w-5" /> Novo barbeiro
              </button>
            )}

            <div className="grid gap-3">
              {barbersQuery.data?.map((b) => (
                <div key={b.id} className={card}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-card-foreground">{b.name}</p>
                      <p className="text-sm text-foreground/70">
                        {b.service_ids.map(serviceName).filter(Boolean).join(", ") || "Nenhum serviço definido"}
                      </p>
                      <p className="text-sm text-foreground/70">{b.user_id ? "Acesso criado" : "Sem acesso"}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-bold text-foreground">
                      {b.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className={btnOutline} onClick={() => open(b)}>Editar</button>
                    <button className={btnOutline} onClick={() => toggle(b)}>{b.active ? "Desativar" : "Ativar"}</button>
                    <button className={btnOutline} disabled={!!b.user_id} onClick={() => invite(b)}>
                      {b.user_id ? "Com acesso" : "Convidar"}
                    </button>
                  </div>
                  {links[b.id] && (
                    <div className="mt-3 rounded-md bg-secondary p-3">
                      <p className="text-xs font-semibold text-foreground/80">Link copiado. Envie ao barbeiro (válido por 7 dias):</p>
                      <p className="break-all text-sm text-brand">{links[b.id]}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
