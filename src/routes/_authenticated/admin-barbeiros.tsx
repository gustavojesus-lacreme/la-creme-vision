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

type Barber = {
  id: string;
  name: string;
  last_name: string;
  whatsapp: string;
  email: string | null;
  active: boolean;
  user_id: string | null;
  service_ids: string[];
  sort_order: number;
};

const card = "rounded-lg border border-border bg-card p-4";
const input =
  "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const btnPrimary = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnOutline = "min-h-12 rounded-md border border-input px-3 text-sm font-semibold text-foreground disabled:opacity-50";

function firstNameOf(b: Barber) {
  return b.last_name && b.name.endsWith(b.last_name) ? b.name.slice(0, -b.last_name.length).trim() : b.name;
}

function AdminBarbersPage() {
  const qc = useQueryClient();
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;

  const barbersQuery = useQuery({
    queryKey: ["admin-barbers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("id, name, last_name, whatsapp, email, active, user_id, service_ids, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Barber[];
    },
  });
  const invitesQuery = useQuery({
    queryKey: ["admin-invites"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("barber_invites")
        .select("barber_id, token, expires_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState("");

  function open(b: Barber | "new") {
    setEditing(b);
    setErr(null);
    setFirstName(b === "new" ? "" : firstNameOf(b));
    setLastName(b === "new" ? "" : b.last_name);
    setWhatsapp(b === "new" ? "" : b.whatsapp);
    setServiceIds(b === "new" ? [] : b.service_ids);
    setActive(b === "new" ? true : b.active);
  }

  async function save() {
    if (!firstName.trim()) return setErr("Informe o nome.");
    if (!lastName.trim()) return setErr("Informe o sobrenome.");
    if (!whatsapp.trim()) return setErr("Informe o WhatsApp.");
    const payload = {
      name: `${firstName.trim()} ${lastName.trim()}`,
      last_name: lastName.trim(),
      whatsapp: whatsapp.trim(),
      service_ids: serviceIds,
      active,
    };
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

  const linkFor = (token: string) => `${window.location.origin}/convite/${token}`;

  function copy(barberId: string, token: string) {
    navigator.clipboard?.writeText(linkFor(token)).catch(() => {});
    setCopied(barberId);
  }

  async function generate(b: Barber) {
    await supabase.from("barber_invites").delete().eq("barber_id", b.id).is("used_at", null);
    const { data, error } = await supabase.from("barber_invites").insert({ barber_id: b.id }).select("token").single();
    if (error || !data) return;
    await qc.invalidateQueries({ queryKey: ["admin-invites"] });
    copy(b.id, data.token);
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
            {editing ? (
              <div className={`${card} space-y-3`}>
                <p className="text-base font-bold text-card-foreground">{editing === "new" ? "Novo barbeiro" : "Editar barbeiro"}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={input} placeholder="Nome" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <input className={input} placeholder="Sobrenome" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <input className={input} placeholder="WhatsApp" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
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
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> Barbeiro ativo
                </label>
                <p className="text-sm text-foreground/70">Função: Barbeiro</p>
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
              {barbersQuery.data?.map((b) => {
                const pending = !b.user_id;
                const invite = invitesQuery.data?.find((i) => i.barber_id === b.id);
                return (
                  <div key={b.id} className={card}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-card-foreground">{b.name}</p>
                        <p className="text-sm text-foreground/70">{b.whatsapp || "WhatsApp não informado"}</p>
                        {b.email && <p className="truncate text-sm text-foreground/70">{b.email}</p>}
                        <p className="mt-1 text-sm text-foreground/70">
                          {b.service_ids.map(serviceName).filter(Boolean).join(", ") || "Nenhum serviço definido"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-bold text-foreground">
                          {b.active ? "Ativo" : "Inativo"}
                        </span>
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${pending ? "border border-gold text-gold" : "bg-brand text-brand-foreground"}`}>
                          {pending ? "AGUARDANDO ATIVAÇÃO" : "Acesso ativo"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button className={btnOutline} onClick={() => open(b)}>Editar</button>
                      <button className={btnOutline} onClick={() => toggle(b)}>{b.active ? "Desativar" : "Ativar"}</button>
                      {pending && (
                        invite ? (
                          <button className={`${btnOutline} col-span-2 sm:col-span-1`} onClick={() => copy(b.id, invite.token)}>Copiar link de acesso</button>
                        ) : (
                          <button className={`${btnOutline} col-span-2 sm:col-span-1`} onClick={() => generate(b)}>Gerar link de acesso</button>
                        )
                      )}
                    </div>
                    {pending && invite && (
                      <div className="mt-3 rounded-md bg-secondary p-3">
                        <p className="text-xs font-semibold text-foreground/80">
                          {copied === b.id ? "Link copiado. " : ""}Envie ao barbeiro pelo WhatsApp. Uso único, válido até{" "}
                          {new Date(invite.expires_at).toLocaleDateString("pt-BR")}.
                        </p>
                        <p className="break-all text-sm text-brand">{linkFor(invite.token)}</p>
                        <button className="mt-2 text-sm font-semibold text-foreground/70 underline" onClick={() => generate(b)}>
                          Gerar novo link (invalida o anterior)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={card}>
              <p className="text-base font-bold text-card-foreground">Visualização de teste</p>
              <p className="mb-2 text-sm text-foreground/70">Veja o painel como um barbeiro, sem alterar sua conta.</p>
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
          </>
        )}
      </main>
    </div>
  );
}
