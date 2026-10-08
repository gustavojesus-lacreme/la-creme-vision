import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import { publicAppOrigin } from "@/lib/public-url";
import { deleteBarber } from "@/lib/invites.functions";
import { formatBarberServices } from "@/lib/booking";
import { activeAbsence, statusLabel, formatDayShort, returnDay, todaySP, type Absence } from "@/lib/absences";

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
  approved_at: string | null;
  service_ids: string[];
  sort_order: number;
  color: string;
  team_role: string;
  commission_service_pct: number | null;
  commission_plan_pct: number | null;
};

const TEAM_ROLES = [
  { v: "barbeiro", l: "Barbeiro" }, { v: "lider", l: "Líder" },
  { v: "administrador", l: "Administrador" }, { v: "dono", l: "Dono/Proprietário" },
];
const hasCommission = (r: string) => r === "barbeiro" || r === "lider";
const pctStr = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

const BARBER_COLORS = ["#2563eb", "#16a34a", "#7f1d1d", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#475569"];

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
        .select("id, name, last_name, whatsapp, email, active, user_id, approved_at, service_ids, sort_order, color, team_role, commission_service_pct, commission_plan_pct")
        .is("archived_at", null)
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
  const absencesQuery = useQuery({
    queryKey: ["admin-absences"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("barber_absences")
        .select("id, barber_id, kind, starts_on, ends_on, note, starts_time")
        .gte("ends_on", todaySP());
      return (data ?? []) as Absence[];
    },
  });

  const [editing, setEditing] = useState<Barber | "new" | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [color, setColor] = useState("");
  const [teamRole, setTeamRole] = useState("barbeiro");
  const [commService, setCommService] = useState("");
  const [commPlan, setCommPlan] = useState("");
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
    setColor(b === "new" ? "" : b.color);
    setTeamRole(b === "new" ? "barbeiro" : b.team_role);
    setCommService(b === "new" ? "" : pctStr(b.commission_service_pct));
    setCommPlan(b === "new" ? "" : pctStr(b.commission_plan_pct));
  }

  async function save() {
    if (!firstName.trim()) return setErr("Informe o nome.");
    if (!lastName.trim()) return setErr("Informe o sobrenome.");
    if (!whatsapp.trim()) return setErr("Informe o WhatsApp.");
    const parsePct = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const cs = hasCommission(teamRole) ? parsePct(commService) : null;
    const cp = hasCommission(teamRole) ? parsePct(commPlan) : null;
    for (const n of [cs, cp]) if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) return setErr("Comissão deve ficar entre 0 e 100%.");
    const payload = {
      team_role: teamRole,
      commission_service_pct: cs,
      commission_plan_pct: cp,
      name: `${firstName.trim()} ${lastName.trim()}`,
      last_name: lastName.trim(),
      whatsapp: whatsapp.trim(),
      service_ids: serviceIds,
      active,
      color,
    };
    const { error } =
      editing === "new"
        ? await supabase.from("barbers").insert({ ...payload, sort_order: (barbersQuery.data?.length ?? 0) + 1 })
        : await supabase.from("barbers").update(payload).eq("id", (editing as Barber).id);
    if (error) return setErr("Não foi possível salvar.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-barbers"] });
  }

  const [confirmAct, setConfirmAct] = useState<Barber | null>(null);
  async function approve(b: Barber) {
    await supabase.from("barbers").update({ approved_at: new Date().toISOString(), active: true }).eq("id", b.id);
    setConfirmAct(null);
    await qc.invalidateQueries({ queryKey: ["admin-barbers"] });
  }

  async function toggle(b: Barber) {
    await supabase.from("barbers").update({ active: !b.active }).eq("id", b.id);
    await qc.invalidateQueries({ queryKey: ["admin-barbers"] });
  }

  const linkFor = (token: string) => `${publicAppOrigin()}/convite/barbeiro/${token}`;
  const [confirmDel, setConfirmDel] = useState<Barber | null>(null);
  const [delMsg, setDelMsg] = useState<string | null>(null);
  async function doDelete(b: Barber) {
    const res = await deleteBarber({ data: { barberId: b.id } }).catch(() => ({ ok: false as const, error: "Não foi possível excluir." }));
    setConfirmDel(null);
    setDelMsg(res.ok ? `${b.name} foi excluído definitivamente.` : res.error);
    qc.invalidateQueries({ queryKey: ["admin-barbers"] });
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
  }

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
                <p className="text-sm font-semibold text-foreground/80">Cor de identificação</p>
                <div className="flex flex-wrap items-center gap-2">
                  {BARBER_COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                      className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-foreground" : "border-border"}`} style={{ backgroundColor: c }} />
                  ))}
                  <label className="flex h-9 items-center gap-1 rounded-md border border-input px-2 text-xs font-semibold text-foreground">
                    Outra <input type="color" value={color || "#475569"} onChange={(e) => setColor(e.target.value)} className="h-6 w-6 border-0 bg-transparent p-0" />
                  </label>
                  {color && <button type="button" className="text-xs font-semibold text-foreground/70 underline" onClick={() => setColor("")}>Sem cor</button>}
                </div>
                <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> Barbeiro ativo
                </label>
                <label className="block space-y-1 text-sm font-semibold text-foreground/80">
                  <span>Perfil na equipe</span>
                  <select className={input} value={teamRole} onChange={(e) => setTeamRole(e.target.value)}>
                    {TEAM_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                </label>
                {hasCommission(teamRole) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1 text-sm font-semibold text-foreground/80"><span>Comissão serviço (%)</span>
                      <input className={input} inputMode="decimal" placeholder="Padrão geral" value={commService} onChange={(e) => setCommService(e.target.value)} /></label>
                    <label className="block space-y-1 text-sm font-semibold text-foreground/80"><span>Comissão plano (%)</span>
                      <input className={input} inputMode="decimal" placeholder="Padrão geral" value={commPlan} onChange={(e) => setCommPlan(e.target.value)} /></label>
                    <p className="col-span-2 text-xs text-foreground/60">Em branco usa o percentual geral do Financeiro. Produtos usam a comissão de cada produto.</p>
                  </div>
                ) : (
                  <p className="text-xs text-foreground/60">Este perfil não recebe comissão. O valor líquido fica com a barbearia.</p>
                )}
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

            {(() => {
              const n = barbersQuery.data?.filter((b) => b.user_id && !b.approved_at).length ?? 0;
              return n > 0 ? (
                <div className="rounded-lg border-2 border-gold bg-card p-4 text-base font-bold text-card-foreground">
                  🟡 {n} barbeiro{n > 1 ? "s" : ""} aguardando ativação
                </div>
              ) : null;
            })()}
            {confirmAct && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
                <div className={`${card} w-full max-w-sm space-y-3`}>
                  <p className="text-base font-bold text-card-foreground">Ativar este barbeiro?</p>
                  <p className="text-sm text-foreground/80">{confirmAct.name} passa a ver a própria agenda e a aparecer para os clientes.</p>
                  <div className="flex gap-2">
                    <button className={`${btnPrimary} flex-1`} onClick={() => approve(confirmAct)}>Ativar</button>
                    <button className={`${btnOutline} flex-1`} onClick={() => setConfirmAct(null)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
            {delMsg && <div className={`${card} text-sm font-semibold text-foreground`}>{delMsg}</div>}
            {confirmDel && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
                <div className={`${card} w-full max-w-sm space-y-3`}>
                  <p className="text-base font-bold text-card-foreground">Excluir definitivamente este barbeiro?</p>
                  <p className="text-sm text-foreground/80">Esta ação removerá o perfil, o acesso e o convite de {confirmDel.name}, junto com os agendamentos dele. Não poderá ser desfeita.</p>
                  <div className="flex gap-2">
                    <button className="min-h-12 flex-1 rounded-md bg-destructive px-4 text-base font-bold text-destructive-foreground" onClick={() => doDelete(confirmDel)}>Excluir definitivamente</button>
                    <button className={`${btnOutline} flex-1`} onClick={() => setConfirmDel(null)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-3">
              {barbersQuery.data?.map((b) => {
                const pending = !b.user_id;
                const awaitingApproval = !!b.user_id && !b.approved_at;
                const invite = invitesQuery.data?.find((i) => i.barber_id === b.id);
                const absence = activeAbsence(absencesQuery.data, b.id);
                const status = pending
                  ? { label: "Aguardando cadastro", sub: "Convite ainda não utilizado", tone: "gold" }
                  : awaitingApproval
                    ? { label: "Pendente de ativação", sub: "Aguardando sua aprovação", tone: "gold" }
                    : !b.active
                      ? { label: "Desativado", sub: "Não recebe agendamentos", tone: "muted" }
                      : absence
                        ? {
                            label: statusLabel(absence.kind),
                            sub: `Retorno em ${formatDayShort(returnDay(absence.ends_on))}`,
                            tone: "gold",
                          }
                        : { label: "Ativo", sub: "Disponível para novos agendamentos", tone: "brand" };
                const badgeCls =
                  status.tone === "brand"
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : status.tone === "gold"
                      ? "border-gold/50 bg-gold/10 text-foreground"
                      : "border-border bg-secondary text-foreground/60";
                return (
                  <div key={b.id} className={card}>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-base font-bold text-card-foreground">
                        {b.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />}
                        {b.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badgeCls}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-foreground/60">{status.sub}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/70">{formatBarberServices(b.service_ids, servicesQuery.data)}</p>
                      <p className="mt-1 text-sm text-foreground/70">{b.whatsapp || "WhatsApp não informado"}</p>
                      {b.email && <p className="truncate text-sm text-foreground/70">{b.email}</p>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button className={btnOutline} onClick={() => open(b)}>Editar</button>
                      {awaitingApproval ? (
                        <button className={btnPrimary} onClick={() => setConfirmAct(b)}>Ativar barbeiro</button>
                      ) : (
                        <button className={btnOutline} disabled={pending} onClick={() => toggle(b)}>{b.active ? "Desativar" : "Ativar"}</button>
                      )}
                      <button className={`${btnOutline} text-destructive`} onClick={() => { setDelMsg(null); setConfirmDel(b); }}>Excluir</button>
                      {pending && (
                        invite ? (
                          <button className={btnOutline} onClick={() => copy(b.id, invite.token)}>Copiar link de convite</button>
                        ) : (
                          <button className={`${btnOutline} col-span-2 sm:col-span-1`} onClick={() => generate(b)}>Gerar link de convite</button>
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
                          Gerar novo link (o anterior deixa de funcionar)
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
                  {barbersQuery.data?.filter((b) => b.user_id && b.approved_at && b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
